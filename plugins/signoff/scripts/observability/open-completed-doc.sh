#!/bin/bash
# Opens a pipeline stage's deliverable doc as soon as that stage's subagent
# finishes, so Soham sees the artifact immediately rather than having to
# know its path and open it himself.
#
# Registered on SubagentStop alongside emit_event.py. Never blocks: any
# failure here (missing file, unsupported OS, python3 missing) is swallowed
# and this always exits 0, same discipline as emit_event.py - a broken
# convenience feature is never a reason to interrupt the session.

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

AGENT=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print('')
    sys.exit(0)
agent = d.get('agent_type') or d.get('subagent_type') or d.get('agent') or ''
print(agent.split(':')[-1])
" 2>/dev/null)

[ -z "$AGENT" ] && exit 0

case "$AGENT" in
  research) DOC="docs/research-discover.md" ;;
  cloud-engineer) DOC="docs/cost-estimate.md" ;;
  finance-analyst) DOC="docs/business-case.md" ;;
  business-analyst) DOC="docs/srs.md" ;;
  system-architect) DOC="docs/architecture.md" ;;
  ui-ux-designer) DOC="docs/design.md" ;;
  pm-coordinator) DOC="docs/sprint-plan.md" ;;
  *) exit 0 ;;
esac

FULL_PATH="$PROJECT_DIR/$DOC"
[ -f "$FULL_PATH" ] || exit 0

[ -n "$(find "$FULL_PATH" -mmin -10 2>/dev/null)" ] || exit 0

case "$(uname -s)" in
  Darwin) open "$FULL_PATH" >/dev/null 2>&1 & ;;
  Linux) xdg-open "$FULL_PATH" >/dev/null 2>&1 & ;;
  *) : ;;
esac

exit 0
