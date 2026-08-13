#!/bin/bash
# Starts the Signoff observability dashboard automatically at the start of
# every Claude Code session in a project, and opens it in a browser tab -
# so the live visibility it provides is actually there by default, not
# something Soham has to remember to launch separately in a second terminal.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PORT="${SIGNOFF_DASHBOARD_PORT:-8787}"
SERVER_SCRIPT="$PROJECT_DIR/scripts/observability/server.py"
LOG_FILE="$PROJECT_DIR/.claude/logs/dashboard.log"

[ -f "$SERVER_SCRIPT" ] || exit 0

if command -v curl >/dev/null 2>&1 && curl -s -o /dev/null -m 1 "http://localhost:$PORT/api/health" 2>/dev/null; then
  echo "Signoff dashboard already running at http://localhost:$PORT"
  exit 0
fi

mkdir -p "$(dirname "$LOG_FILE")"
( cd "$PROJECT_DIR" && nohup python3 "$SERVER_SCRIPT" --port "$PORT" >"$LOG_FILE" 2>&1 & )

sleep 1

case "$(uname -s)" in
  Darwin) open "http://localhost:$PORT" >/dev/null 2>&1 & ;;
  Linux) xdg-open "http://localhost:$PORT" >/dev/null 2>&1 & ;;
  *) : ;;
esac

echo "Signoff dashboard started at http://localhost:$PORT (log: $LOG_FILE)"
exit 0
