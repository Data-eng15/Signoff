#!/bin/bash
# Blocks any Bash command that pushes directly to main - applies to every
# agent (main session, subagents, teammates) using this plugin.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE 'git push[^|&]*\bmain\b'; then
  "${CLAUDE_PLUGIN_ROOT}/scripts/observability/append_event.sh" "HookBlock" "main" "block-main-push fired · push to main denied" 2>/dev/null
  echo "Blocked: no direct pushes to main. Open an MR from a feat/fix branch instead." >&2
  exit 2
fi

exit 0
