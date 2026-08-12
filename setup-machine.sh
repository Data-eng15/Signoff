#!/bin/bash
# Run once per machine, not per project.
# Registers this repo as a marketplace and installs career-coach at user
# scope, so it's available from inside any project without reinstalling.
set -e

# Defaults to this script's own directory (works offline, always matches
# your local edits). Override with a git URL once this repo lives on
# GitLab/GitHub and you want every machine pulling the same canonical copy:
#   MARKETPLACE_SOURCE=https://gitlab.com/you/signoff ./setup-machine.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETPLACE_SOURCE="${MARKETPLACE_SOURCE:-$SCRIPT_DIR}"

echo "Adding marketplace from: $MARKETPLACE_SOURCE"
claude plugin marketplace add "$MARKETPLACE_SOURCE"

echo "Installing career-coach at user scope..."
claude plugin install career-coach@soham-team-kit --scope user

echo "Linking the /new-project custom command into ~/.claude/commands/..."
mkdir -p ~/.claude/commands
# Always symlinks from THIS local clone (SCRIPT_DIR), not MARKETPLACE_SOURCE -
# the latter may be a URL if you overrode it above, which ln can't target.
ln -sf "$SCRIPT_DIR/user-commands/new-project.md" ~/.claude/commands/new-project.md
echo "Symlinked, not copied - a future 'git pull' in this repo updates the command automatically."

echo ""
echo "Done. From now on: git clone a fresh project repo, cd into it, run 'claude',"
echo "then type /new-project <slug> [region] [guardrail] - that's the whole setup."
