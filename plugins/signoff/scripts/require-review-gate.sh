#!/bin/bash
# Blocks a pipeline-stage subagent from starting until the checkpoint-review
# interview for the prior stage has actually been logged.
INPUT=$(cat)
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')

check_reviewed() {
  local stage="$1"
  if [ ! -f docs/review-log.md ] || ! grep -qi "$stage" docs/review-log.md; then
    "${CLAUDE_PLUGIN_ROOT}/scripts/observability/append_event.sh" "ReviewGate" "$AGENT_TYPE" "held · '$stage' not yet reviewed" 2>/dev/null
    echo "Blocked: '$stage' hasn't been through the checkpoint interview yet. Run the checkpoint-review skill first." >&2
    exit 2
  fi
}

case "$AGENT_TYPE" in
  mcp-provisioner)
    check_reviewed "research-discover"
    ;;
  cloud-engineer)
    check_reviewed "research-discover"
    ;;
  business-analyst)
    check_reviewed "business-case"
    ;;
  system-architect)
    check_reviewed "SRS"
    ;;
  architecture-critic)
    check_reviewed "SRS"
    ;;
  ui-ux-designer)
    check_reviewed "architecture"
    ;;
  pm-coordinator)
    check_reviewed "design"
    ;;
  devops-engineer)
    check_reviewed "architecture"
    ;;
  frontend-developer)
    check_reviewed "architecture"
    check_reviewed "design"
    check_reviewed "sprint-plan"
    ;;
  backend-developer)
    check_reviewed "architecture"
    check_reviewed "sprint-plan"
    ;;
esac

exit 0
