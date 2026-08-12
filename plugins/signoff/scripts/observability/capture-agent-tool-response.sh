#!/bin/bash
# TEMPORARY DIAGNOSTIC HOOK — not part of the permanent observability system.
#
# Captures the raw PostToolUse payload for Agent (subagent) tool calls,
# verbatim, so the real tool_response telemetry shape (token/cost data)
# can be confirmed against an actual live payload instead of guessed from
# documentation excerpts. The SubagentStop hook was already found not to
# carry usage data at all (confirmed via anthropics/claude-code#50883 and
# #11008) — this checks whether PostToolUse on the Agent tool call itself
# carries it in tool_response instead, per the hooks reference's mention
# of "run telemetry in tool_response" for foreground Agent calls.
#
# Delete this hook and this script once the schema is confirmed and
# emit_event.py is updated to read the real field names directly.
LOG_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/logs"
mkdir -p "$LOG_DIR"
cat >> "$LOG_DIR/agent-tool-response-debug.jsonl"
