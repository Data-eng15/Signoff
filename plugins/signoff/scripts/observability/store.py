"""
Event store for the observability dashboard.

Source of truth is .claude/logs/events.jsonl, written one line at a time by
emit_event.py and append_event.sh. This module keeps a local SQLite database
(rollup.db, next to this file) that mirrors that log so the API can query
and aggregate quickly without re-parsing the whole file on every request.

On startup: replay every line in events.jsonl into SQLite (id is the primary
key, so replay is idempotent - safe to run every time the server starts).
While running: poll the file every ~1s for new lines, insert them, and hand
each new row to a callback so the server can push it over the WebSocket.

Run pairing (SubagentStart -> SubagentStop -> a "run"): there's no explicit
run id in the event schema, so runs are paired sequentially per agent - the
Nth Start pairs with the Nth Stop that follows it. This holds as long as a
given agent isn't invoked as two overlapping parallel instances, which
matches this kit's orchestration rule (no parallel spawning without asking
first). If that rule is ever broken, run pairing here will misattribute -
worth knowing if the numbers look wrong for a specific agent.

Token totals per run: prefer the SubagentStop event's own usage block if one
came through non-zero; otherwise fall back to summing every PostToolUse
usage block with ts between that run's Start and Stop. Which path fires
depends on whether your Claude Code version's SubagentStop payload actually
carries a cumulative usage field - unconfirmed without a live session, so
check a few real runs after this is wired in.
"""
import json
import os
import sqlite3
import threading
import time
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ts_ms INTEGER NOT NULL,
    ts_iso TEXT NOT NULL,
    session_id TEXT,
    agent TEXT,
    hook_event_name TEXT,
    tool_name TEXT,
    decision TEXT,
    duration_ms REAL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    summary TEXT,
    payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(hook_event_name);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def _iso_to_ms(iso):
    try:
        s = iso.replace("Z", "+00:00")
        import datetime

        return int(datetime.datetime.fromisoformat(s).timestamp() * 1000)
    except Exception:
        return int(time.time() * 1000)


class Store:
    def __init__(self, jsonl_path: Path, db_path: Path):
        self.jsonl_path = Path(jsonl_path)
        self.db_path = Path(db_path)
        self._lock = threading.Lock()
        self._subscribers = []
        self._stop = False
        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ---- ingestion --------------------------------------------------

    def replay_all(self):
        """Idempotent full replay - safe to call on every startup."""
        if not self.jsonl_path.exists():
            return
        with open(self.jsonl_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                self._ingest_line(line)
        self._set_meta("offset", str(self.jsonl_path.stat().st_size))
        self.conn.commit()

    def _set_meta(self, key, value):
        with self._lock:
            self.conn.execute(
                "INSERT INTO meta(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )

    def _get_meta(self, key, default=None):
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else default

    def _ingest_line(self, line):
        line = line.strip()
        if not line:
            return
        try:
            e = json.loads(line)
        except Exception:
            return
        usage = e.get("usage") or {}
        ts_iso = e.get("ts") or ""
        try:
            with self._lock:
                self.conn.execute(
                    "INSERT OR IGNORE INTO events "
                    "(id, ts_ms, ts_iso, session_id, agent, hook_event_name, tool_name, "
                    " decision, duration_ms, input_tokens, output_tokens, cache_read_tokens, "
                    " summary, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        e.get("id") or f"gen-{ts_iso}-{hash(line) & 0xffff}",
                        _iso_to_ms(ts_iso),
                        ts_iso,
                        e.get("session_id"),
                        e.get("agent", "main"),
                        e.get("hook_event_name", "Unknown"),
                        e.get("tool_name"),
                        e.get("decision", "allow"),
                        e.get("duration_ms"),
                        usage.get("input_tokens", 0),
                        usage.get("output_tokens", 0),
                        usage.get("cache_read_input_tokens", 0),
                        e.get("summary", ""),
                        line,
                    ),
                )
        except Exception:
            pass

    def start_tailing(self, on_new_event=None):
        """Background thread: poll for new lines every ~1s, ingest, notify."""

        def loop():
            last_size = self.jsonl_path.stat().st_size if self.jsonl_path.exists() else 0
            offset = int(self._get_meta("offset", "0") or 0)
            while not self._stop:
                time.sleep(1.0)
                try:
                    if not self.jsonl_path.exists():
                        continue
                    size = self.jsonl_path.stat().st_size
                    if size < offset:
                        offset = 0  # file was rotated/truncated
                    if size > offset:
                        with open(self.jsonl_path, "r", encoding="utf-8", errors="replace") as f:
                            f.seek(offset)
                            new_lines = f.readlines()
                            offset = f.tell()
                        for line in new_lines:
                            self._ingest_line(line)
                            if on_new_event:
                                try:
                                    on_new_event(json.loads(line))
                                except Exception:
                                    pass
                        self._set_meta("offset", str(offset))
                        with self._lock:
                            self.conn.commit()
                except Exception:
                    pass

        t = threading.Thread(target=loop, daemon=True)
        t.start()
        return t

    def stop(self):
        self._stop = True

    # ---- queries ------------------------------------------------------

    def all_agents_seen(self):
        rows = self.conn.execute(
            "SELECT DISTINCT agent FROM events WHERE agent IS NOT NULL AND agent != 'main' ORDER BY agent"
        ).fetchall()
        return [r[0] for r in rows]

    def event_count(self):
        return self.conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]

    def events_since(self, since_ms=0, agent=None, type_=None, q=None, limit=200):
        clauses = ["ts_ms >= ?"]
        params = [since_ms]
        if agent and agent != "all agents":
            clauses.append("agent = ?")
            params.append(agent)
        if type_ and type_ != "all":
            clauses.append("hook_event_name = ?")
            params.append(type_)
        if q:
            clauses.append("(summary LIKE ? OR payload LIKE ? OR agent LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like, like])
        sql = (
            "SELECT id, ts_ms, ts_iso, agent, hook_event_name, tool_name, summary, "
            "input_tokens, output_tokens, cache_read_tokens, payload FROM events "
            f"WHERE {' AND '.join(clauses)} ORDER BY ts_ms DESC LIMIT ?"
        )
        params.append(limit)
        rows = self.conn.execute(sql, params).fetchall()
        return [self._row_to_event(r) for r in rows]

    def _row_to_event(self, r):
        (id_, ts_ms, ts_iso, agent, type_, tool_name, summary, itok, otok, ctok, payload) = r
        return {
            "id": id_,
            "ts": ts_iso,
            "ts_ms": ts_ms,
            "agent": agent,
            "type": type_,
            "tool_name": tool_name,
            "summary": summary,
            "tok": (itok or 0) + (otok or 0),
            "payload": payload,
        }

    def runs_for_agent(self, agent):
        """Pair SubagentStart/Stop sequentially; return list of run dicts, oldest first."""
        starts = self.conn.execute(
            "SELECT ts_ms, ts_iso FROM events WHERE agent=? AND hook_event_name='SubagentStart' ORDER BY ts_ms",
            (agent,),
        ).fetchall()
        stops = self.conn.execute(
            "SELECT ts_ms, ts_iso, summary, duration_ms, input_tokens, output_tokens, cache_read_tokens "
            "FROM events WHERE agent=? AND hook_event_name='SubagentStop' ORDER BY ts_ms",
            (agent,),
        ).fetchall()

        runs = []
        si = 0
        for stop in stops:
            stop_ts, stop_iso, summary, dur_ms, s_i, s_o, s_c = stop
            start_ts = None
            while si < len(starts) and starts[si][0] <= stop_ts:
                start_ts = starts[si][0]
                si += 1
            span_start = start_ts if start_ts is not None else stop_ts - (dur_ms or 0)

            stop_usage_total = (s_i or 0) + (s_o or 0) + (s_c or 0)
            if stop_usage_total > 0:
                tok = stop_usage_total
            else:
                agg = self.conn.execute(
                    "SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), "
                    "COALESCE(SUM(cache_read_tokens),0) FROM events "
                    "WHERE agent=? AND hook_event_name='PostToolUse' AND ts_ms BETWEEN ? AND ?",
                    (agent, span_start, stop_ts),
                ).fetchone()
                tok = sum(agg)

            duration_s = (dur_ms / 1000.0) if dur_ms else max((stop_ts - span_start) / 1000.0, 0)
            ok = "interrupted" not in (summary or "").lower()
            runs.append(
                {
                    "when": stop_iso,
                    "when_ms": stop_ts,
                    "ok": ok,
                    "duration_s": duration_s,
                    "tokens": tok,
                }
            )
        return runs

    def agent_stats(self):
        agents = self.all_agents_seen()
        out = []
        for name in agents:
            runs = self.runs_for_agent(name)
            last = self.conn.execute(
                "SELECT ts_ms, hook_event_name FROM events WHERE agent=? ORDER BY ts_ms DESC LIMIT 1",
                (name,),
            ).fetchone()
            running = bool(
                self.conn.execute(
                    "SELECT 1 FROM events WHERE agent=? AND hook_event_name='SubagentStart' "
                    "AND ts_ms > COALESCE((SELECT MAX(ts_ms) FROM events WHERE agent=? AND hook_event_name='SubagentStop'), 0) "
                    "LIMIT 1",
                    (name, name),
                ).fetchone()
            )
            n = len(runs)
            total_tok = sum(r["tokens"] for r in runs)
            total_dur = sum(r["duration_s"] for r in runs)
            ok_count = sum(1 for r in runs if r["ok"])
            out.append(
                {
                    "name": name,
                    "runs": n,
                    "avg_duration_s": (total_dur / n) if n else 0,
                    "avg_tokens": (total_tok / n) if n else 0,
                    "total_tokens": total_tok,
                    "ok_pct": round((ok_count / n) * 100) if n else 100,
                    "running": running,
                    "last_ts_ms": last[0] if last else None,
                    "spark": [r["tokens"] for r in runs[-12:]],
                    "runs_detail": runs,
                }
            )
        return out

    def review_gate_events(self, limit=50):
        rows = self.conn.execute(
            "SELECT ts_iso, agent, summary FROM events WHERE hook_event_name='ReviewGate' "
            "ORDER BY ts_ms DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [{"ts": r[0], "agent": r[1], "summary": r[2]} for r in rows]

    def hook_blocks(self, limit=50):
        rows = self.conn.execute(
            "SELECT ts_iso, agent, summary FROM events WHERE hook_event_name='HookBlock' "
            "ORDER BY ts_ms DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [{"ts": r[0], "agent": r[1], "summary": r[2]} for r in rows]

    def token_totals(self):
        row = self.conn.execute(
            "SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), "
            "COALESCE(SUM(cache_read_tokens),0) FROM events"
        ).fetchone()
        return {"input": row[0], "output": row[1], "cache_read": row[2]}

    def token_series(self, agent, range_):
        """Bucketed series for the tokens chart. range_ in {'24h','7d','session'}."""
        clauses = ["hook_event_name IN ('PostToolUse','SubagentStop')"]
        params = []
        if agent and agent != "all agents":
            clauses.append("agent = ?")
            params.append(agent)
        now_ms = int(time.time() * 1000)
        if range_ == "7d":
            since = now_ms - 7 * 86400 * 1000
            bucket_ms = 86400 * 1000
            n_buckets = 7
        elif range_ == "session":
            since = 0
            bucket_ms = None  # bucket by session_id instead
            n_buckets = None
        else:
            since = now_ms - 24 * 3600 * 1000
            bucket_ms = 3600 * 1000
            n_buckets = 24
        clauses.append("ts_ms >= ?")
        params.append(since)
        sql = (
            "SELECT ts_ms, session_id, input_tokens, output_tokens, cache_read_tokens FROM events "
            f"WHERE {' AND '.join(clauses)} ORDER BY ts_ms"
        )
        rows = self.conn.execute(sql, params).fetchall()

        if range_ == "session":
            buckets = {}
            order = []
            for ts_ms, sid, i, o, c in rows:
                sid = sid or "unknown"
                if sid not in buckets:
                    buckets[sid] = {"i": 0, "o": 0, "c": 0}
                    order.append(sid)
                buckets[sid]["i"] += i or 0
                buckets[sid]["o"] += o or 0
                buckets[sid]["c"] += c or 0
            return [
                {"label": f"s{idx+1}", "i": buckets[s]["i"], "o": buckets[s]["o"], "c": buckets[s]["c"]}
                for idx, s in enumerate(order[-14:])
            ]

        buckets = [{"i": 0, "o": 0, "c": 0} for _ in range(n_buckets)]
        start = since
        for ts_ms, sid, i, o, c in rows:
            idx = min(int((ts_ms - start) / bucket_ms), n_buckets - 1)
            buckets[idx]["i"] += i or 0
            buckets[idx]["o"] += o or 0
            buckets[idx]["c"] += c or 0
        labels = []
        for idx in range(n_buckets):
            if range_ == "7d":
                labels.append(f"−{n_buckets - idx}d" if idx < n_buckets - 1 else "today")
            else:
                labels.append(f"−{n_buckets - idx}h" if idx < n_buckets - 1 else "now")
        return [dict(buckets[i], label=labels[i]) for i in range(n_buckets)]

    def close(self):
        self.conn.close()
