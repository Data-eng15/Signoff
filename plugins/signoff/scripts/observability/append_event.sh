#!/bin/bash
# Logs one denial event to .claude/logs/events.jsonl.
#
# Why this exists instead of emit_event.py covering blocks too: when several
# PreToolUse/SubagentStart hooks are registered on the same matcher, each
# hook only knows its own verdict - a passive logger sitting next to
# block-main-push.sh has no way to observe that block-main-push.sh (not it)
# denied the call. So the hook that actually makes the deny decision is the
# one that logs it, right before it exits 2. Call this as the last line
# before `exit 2` in any guardrail hook.
#
# Usage: append_event.sh <hook_event_name> <agent> <summary>
# Uses python3 rather than jq for the JSON write - python3 is already a hard
# dependency of this kit's observability server, jq isn't guaranteed to be
# installed everywhere. Never fails the caller - always returns 0.

EVENT="${1:-HookBlock}"
AGENT="${2:-main}"
SUMMARY="${3:-blocked}"

python3 - "$EVENT" "$AGENT" "$SUMMARY" <<'PYEOF' 2>/dev/null
import json, os, sys, time, uuid, datetime
from pathlib import Path

event, agent, summary = sys.argv[1], sys.argv[2], sys.argv[3]
project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
log_dir = Path(project_dir) / ".claude" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
dt = datetime.datetime.now(datetime.timezone.utc)
ts = dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"
row = {
    "id": f"e-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}",
    "ts": ts, "hook_event_name": event, "agent": agent,
    "decision": "deny", "summary": summary, "usage": None, "duration_ms": None,
}
with open(log_dir / "events.jsonl", "a", encoding="utf-8") as f:
    f.write(json.dumps(row) + "\n")
PYEOF

exit 0
