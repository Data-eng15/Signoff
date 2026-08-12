#!/bin/bash
# Blocks any git commit (or amend) whose command contains Claude/AI attribution
# text - backstop for the attribution settings, which have a documented
# history of not always being honored on their own.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '^git (commit|commit --amend)'; then
  if echo "$COMMAND" | grep -qiE 'co-authored-by|noreply@anthropic\.com|generated with claude|claude code'; then
    "${CLAUDE_PLUGIN_ROOT}/scripts/observability/append_event.sh" "HookBlock" "main" "block-ai-attribution fired · commit denied" 2>/dev/null
    echo "Blocked: this commit includes AI attribution text. Remove the Co-Authored-By line / Claude Code footer and commit again - every commit here is authored by Soham only." >&2
    exit 2
  fi
fi

exit 0
