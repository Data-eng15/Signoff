#!/usr/bin/env python3
"""
Signoff observability server.

Serves the dashboard API, the live event WebSocket, and the built frontend
- all on one port - so cloning the project and running this one command is
the whole setup.

Project directory resolution (what this reads/writes events for):
  1. $CLAUDE_PROJECT_DIR if set
  2. $PROJECT_ROOT if set
  3. Three directories up from this file (scripts/observability/server.py
     -> scripts -> <project root>), which is where new-project.sh vendors
     this tool during bootstrap
  4. The current working directory, as a last resort

Run it:
    python3 server.py                  # port 8787
    python3 server.py --port 9000      # a different port
    PORT=9000 python3 server.py        # same, via env var

It keeps running until you stop it (Ctrl+C, or `kill` on the process) - no
idle timeout, no auto-shutdown. Leave it running for the life of the
project; only stop it when the project itself is done.
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from store import Store
from review_log import parse_review_log
import report as report_mod

HERE = Path(__file__).resolve().parent


def resolve_project_root() -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR") or os.environ.get("PROJECT_ROOT")
    if env:
        return Path(env).resolve()
    candidate = HERE.parents[1]  # scripts/observability -> scripts -> project root
    if (candidate / ".git").exists() or (candidate / "docs").exists() or (candidate / ".claude").exists():
        return candidate
    return Path.cwd()


PROJECT_ROOT = resolve_project_root()
LOG_DIR = PROJECT_ROOT / ".claude" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVENTS_PATH = LOG_DIR / "events.jsonl"
DB_PATH = LOG_DIR / "rollup.db"
RATES_PATH = HERE / "config" / "rates.json"
FRONTEND_DIR = HERE / "frontend"

try:
    RATES = json.loads(RATES_PATH.read_text())
except Exception:
    RATES = {"default_model": "claude-sonnet-4-5", "cache_read_ratio": 0.1,
              "models": {"claude-sonnet-4-5": {"input": 3.0, "output": 15.0}}}

store = Store(EVENTS_PATH, DB_PATH)
store.replay_all()

ws_clients: set[WebSocket] = set()
main_loop: asyncio.AbstractEventLoop | None = None


def broadcast(event: dict):
    if not ws_clients or main_loop is None:
        return
    dead = []
    payload = json.dumps({"type": "event", "data": event})
    for ws in list(ws_clients):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(payload), main_loop)
        except Exception:
            dead.append(ws)
    for d in dead:
        ws_clients.discard(d)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_event_loop()
    store.start_tailing(on_new_event=broadcast)
    port = os.environ.get("_ATK_PORT", "8787")
    print("")
    print("=" * 62)
    print(f"  Signoff dashboard running at http://localhost:{port}")
    print(f"  project: {PROJECT_ROOT}")
    print(f"  watching: {EVENTS_PATH}")
    print("  stays up until you stop it (Ctrl+C) - leave it running for")
    print("  the life of the project.")
    print("=" * 62)
    print("")
    yield
    store.stop()


app = FastAPI(title="Signoff observability", lifespan=lifespan)


def cost_of(input_tok, output_tok, cache_tok):
    model = RATES.get("default_model", "claude-sonnet-4-5")
    rate = RATES.get("models", {}).get(model, {"input": 3.0, "output": 15.0})
    ratio = RATES.get("cache_read_ratio", 0.1)
    return (
        input_tok / 1e6 * rate["input"]
        + output_tok / 1e6 * rate["output"]
        + cache_tok / 1e6 * rate["input"] * ratio
    )


# ---------------------------------------------------------------- API ----

@app.get("/api/health")
def health():
    return {"ok": True, "project_root": str(PROJECT_ROOT), "events_path": str(EVENTS_PATH)}


@app.get("/api/summary")
def summary():
    agents = store.agent_stats()
    totals = store.token_totals()
    total_tok = totals["input"] + totals["output"] + totals["cache_read"]
    running = [a["name"] for a in agents if a["running"]]
    blocked_recent = len(store.hook_blocks(limit=1))
    n_reviewed = len(parse_review_log(PROJECT_ROOT / "docs" / "review-log.md"))
    return {
        "tokens_today": total_tok,
        "cost_estimate": round(cost_of(totals["input"], totals["output"], totals["cache_read"]), 2),
        "event_count": store.event_count(),
        "agents_seen": len(agents),
        "running_agents": running,
        "stages_reviewed": n_reviewed,
        "recent_block": blocked_recent > 0,
        "rates_model": RATES.get("default_model"),
    }


@app.get("/api/agents")
def agents():
    out = []
    for a in store.agent_stats():
        out.append(
            {
                "name": a["name"],
                "runs": a["runs"],
                "avg_duration_s": round(a["avg_duration_s"], 1),
                "avg_tokens": round(a["avg_tokens"]),
                "total_tokens": a["total_tokens"],
                "est_cost": round(cost_of(a["total_tokens"] * 0.72, a["total_tokens"] * 0.28, 0), 2),
                "ok_pct": a["ok_pct"],
                "running": a["running"],
                "last_ts_ms": a["last_ts_ms"],
                "spark": a["spark"],
            }
        )
    return out


@app.get("/api/agents/{name}/runs")
def agent_runs(name: str, limit: int = 50):
    runs = store.runs_for_agent(name)
    runs = list(reversed(runs))[:limit]
    return [
        {
            "when": r["when"],
            "ok": r["ok"],
            "duration_s": round(r["duration_s"], 1),
            "tokens": r["tokens"],
            "cost": round(cost_of(r["tokens"] * 0.72, r["tokens"] * 0.28, 0), 3),
        }
        for r in runs
    ]


@app.get("/api/tokens")
def tokens(agent: str = "all agents", range: str = "24h"):
    series = store.token_series(agent, range)
    total = sum(d["i"] + d["o"] + d["c"] for d in series)
    return {
        "series": series,
        "total": total,
        "output_share": round(sum(d["o"] for d in series) / total * 100) if total else 0,
        "cache_read": sum(d["c"] for d in series),
        "est_cost": round(cost_of(
            sum(d["i"] for d in series), sum(d["o"] for d in series), sum(d["c"] for d in series)
        ), 2),
        "model": RATES.get("default_model"),
        "rates": RATES.get("models", {}).get(RATES.get("default_model"), {}),
    }


@app.get("/api/events")
def events(agent: str = None, type: str = None, since: int = 0, q: str = None, limit: int = 200):
    return store.events_since(since_ms=since, agent=agent, type_=type, q=q, limit=min(limit, 500))


@app.get("/api/review-log")
def review_log():
    return parse_review_log(PROJECT_ROOT / "docs" / "review-log.md")


@app.post("/api/ask")
async def ask(body: dict):
    question = (body or {}).get("question", "").strip()
    if not question:
        return JSONResponse({"error": "question is required"}, status_code=400)
    ql = question.lower()
    agents_list = store.all_agents_seen()
    agent = next((a for a in agents_list if a in ql), None)

    pool = store.events_since(since_ms=0, agent=agent, limit=500)
    if "block" in ql or "why" in ql:
        blocks = [e for e in pool if e["type"] in ("HookBlock", "ReviewGate")]
        if blocks:
            others = [e for e in pool if e["type"] not in ("HookBlock", "ReviewGate")]
            pool = (blocks + others)[:60]
    if "cost" in ql or "token" in ql:
        toked = [e for e in pool if e["tok"] > 0]
        pool = (toked + pool)[:60]

    slice_ = pool[:40]
    live = any(a["name"] == agent and a["running"] for a in store.agent_stats()) if agent else False
    tools = {}
    for e in slice_:
        if e["type"] == "PreToolUse" and e.get("tool_name"):
            tools[e["tool_name"]] = tools.get(e["tool_name"], 0) + 1
    top_tools = sorted(tools.items(), key=lambda x: -x[1])[:3]

    blocks = [e for e in slice_ if e["type"] == "HookBlock"]
    gates = [e for e in slice_ if e["type"] == "ReviewGate"]
    tok = sum(e["tok"] for e in slice_)
    span_min = 0
    if slice_:
        span_min = round((slice_[0]["ts_ms"] - slice_[-1]["ts_ms"]) / 60000)

    lines = []
    lines.append(
        f"{agent or 'All agents'}: {len(slice_)} logged events over the last {span_min} min, "
        f"{tok} tokens ≈ ${cost_of(tok*0.72, tok*0.28, 0):.2f}."
    )
    if top_tools:
        lines.append("Tool activity concentrated in " + ", ".join(f"{t}×{n}" for t, n in top_tools) + ".")
    if blocks:
        lines.append(f"{len(blocks)} hook block(s) in this slice - most recent: {blocks[0]['summary']}.")
    else:
        lines.append("No hook blocks in this slice; nothing was denied by a guard hook.")
    if gates:
        held = sum(1 for g in gates if "held" in g["summary"].lower())
        lines.append(f"Checkpoint review: {len(gates) - held} passed / {held} held, per review-log.md.")
    lines.append(
        "This agent is running now - the current turn is not in the log until its PostToolUse hook fires."
        if live
        else "This run is finished, so the event span and transcript slice are complete."
    )

    return {
        "title": f"{agent or 'Across the pipeline'} · {'why it stalled' if 'why' in ql else 'recent activity'}",
        "lines": lines,
        "evidence": slice_[:7],
        "scope": "running" if live else "past",
        "agent": agent,
    }


@app.get("/api/report")
def get_report():
    path = PROJECT_ROOT / "docs" / "handover-report.md"
    if not path.exists():
        return JSONResponse({"exists": False, "content": None}, status_code=200)
    return {"exists": True, "content": path.read_text(encoding="utf-8")}


@app.post("/api/report/generate")
def generate_report():
    project_slug = os.environ.get("PROJECT_SLUG", "")
    path, content = report_mod.write_report(PROJECT_ROOT, store, RATES, project_slug)
    return {"path": str(path), "content": content}


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "data": {"events": store.event_count()}}))
        while True:
            await ws.receive_text()  # client doesn't need to send anything; just keep alive
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)


# ------------------------------------------------------------ frontend ----

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR)), name="assets")

    @app.get("/")
    def index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)))
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    os.environ["_ATK_PORT"] = str(args.port)

    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
