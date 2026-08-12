#!/usr/bin/env python3
"""
Observability hook writer for Signoff.

Registered on PreToolUse, PostToolUse, SubagentStart, SubagentStop, and Stop
in .claude/settings.json (see hooks.json). Reads the hook's JSON payload from
stdin, appends one line to .claude/logs/events.jsonl, and always exits 0.

This script must never block anything it's attached to. Everything below is
wrapped so that any failure - a missing field, a permissions error, a full
disk - is swallowed rather than surfaced. A broken observability script is
never an acceptable reason for a real hook, a tool call, or the session
itself to fail.

Field-name note: SubagentStart/SubagentStop payload shapes are read
defensively via `first()` below, trying several plausible key names, because
this was built without a live Claude Code session to confirm the exact
schema against. The first real lines this writes to events.jsonl are worth a
manual check - if `agent` or `usage` comes through empty where it shouldn't,
add the missing key name to the relevant first(...) call.
"""
import json
import os
import sys
import time
import uuid
import datetime
from pathlib import Path


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        data = {}

    try:
        write_event(data)
    except Exception:
        pass  # logging must never be the reason a hook fails

    sys.exit(0)  # this hook never blocks - always allow


def first(data, *keys, default=None):
    for k in keys:
        v = data.get(k)
        if v not in (None, ""):
            return v
    return default


def now_iso():
    dt = datetime.datetime.now(datetime.timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def summarize(hook_event, tool_name, tool_input, data):
    if hook_event == "PreToolUse":
        detail = (
            tool_input.get("command")
            or tool_input.get("file_path")
            or tool_input.get("pattern")
            or tool_input.get("url")
            or ""
        )
        base = f"{tool_name or 'tool'}"
        return f"{base} · {str(detail)[:90]}".rstrip(" ·") if detail else base
    if hook_event == "PostToolUse":
        return f"{tool_name or 'tool'} completed"
    if hook_event == "SubagentStart":
        task = first(data, "prompt_preview", "description", "task", default="")
        return f"invoked · {task}"[:120].rstrip(" ·")
    if hook_event == "SubagentStop":
        status = first(data, "status", "stop_reason", default="completed")
        return str(status)
    if hook_event == "Stop":
        return "session ended"
    return hook_event or "event"


def write_event(data):
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    log_dir = Path(project_dir) / ".claude" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    hook_event = data.get("hook_event_name", "Unknown")
    agent = first(data, "agent_type", "subagent_type", "agent", default="main")
    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input") or {}
    usage = first(data, "usage", default=None) or {}
    duration_ms = first(data, "duration_ms", "duration", default=None)
    if hook_event == "SubagentStop":
        # some payload shapes report duration in seconds for subagent spans,
        # and take priority over duration_ms/duration if both are present
        duration_s = first(data, "duration_s", default=None)
        if duration_s is not None:
            duration_ms = float(duration_s) * 1000

    summary = summarize(hook_event, tool_name, tool_input, data)

    event = {
        "id": f"e-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "ts": data.get("timestamp") or now_iso(),
        "session_id": data.get("session_id", "unknown"),
        "project": Path(str(project_dir)).name,
        "hook_event_name": hook_event,
        "agent": agent,
        "tool_name": tool_name,
        "tool_input": tool_input if hook_event == "PreToolUse" else None,
        "decision": "allow",
        "duration_ms": duration_ms,
        "usage": {
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        }
        if usage
        else None,
        "summary": summary,
    }

    with open(log_dir / "events.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")


if __name__ == "__main__":
    main()
