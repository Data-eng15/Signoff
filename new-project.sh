#!/bin/bash
# One command to set up a new project end to end: install signoff
# with this project's parameters, then scaffold the repo.
#
# Usage: ./new-project.sh <project_slug> [guardrail_level] [cloud_hint]
# cloud_hint is optional and should be left blank in almost every case -
# cloud-engineer decides the provider/region during feasibility analysis.
# Only set it if a client contractually requires a specific one up front.
# Run from inside the (empty or existing) project's git repo root, after
# setup-machine.sh has been run at least once on this machine.
set -e

PROJECT_SLUG="${1:?Usage: ./new-project.sh <project_slug> [guardrail_level] [cloud_hint]}"
GUARDRAIL_LEVEL="${2:-standard}"
CLOUD_HINT="${3:-}"

echo "Installing signoff for project '$PROJECT_SLUG' (guardrail: $GUARDRAIL_LEVEL)..."
if [ -n "$CLOUD_HINT" ]; then
  echo "Cloud hint set: '$CLOUD_HINT' - cloud-engineer will treat this as fixed, not evaluate it."
  claude plugin install signoff@soham-team-kit --scope project \
    --config project_slug="$PROJECT_SLUG" \
    --config guardrail_level="$GUARDRAIL_LEVEL" \
    --config cloud_hint="$CLOUD_HINT"
else
  claude plugin install signoff@soham-team-kit --scope project \
    --config project_slug="$PROJECT_SLUG" \
    --config guardrail_level="$GUARDRAIL_LEVEL"
fi

echo "Scaffolding project structure..."
# --permission-mode acceptEdits is a deliberate, narrow exception to the
# ask-every-time rule this whole kit otherwise follows. It applies to this
# one headless call only, scaffolding empty template files in what should
# be a fresh repo. Every pipeline agent after this point goes back to full
# default permission prompts - this script doesn't change that.
claude -p "/signoff:bootstrap-project" --permission-mode acceptEdits

# Vendor the observability dashboard's real code (server.py, frontend, hook
# scripts) into this project repo, rather than referencing it live from the
# installed plugin. It has to be a physical copy: server.py needs a stable
# relative path to run from (scripts/observability/server.py, three levels
# above the project root), and CLAUDE_PLUGIN_ROOT is only set inside a hook
# invocation - a manually-opened terminal running the dashboard wouldn't
# have it. Trade-off worth knowing: because this is a copy, not a live
# reference, `claude plugin update signoff` won't update it - rerun
# the two lines below in an existing project if you want a newer version of
# the dashboard itself. -n (no-clobber) protects any local edits you've made.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/plugins/signoff/scripts/observability" ]; then
  echo "Vendoring the observability dashboard into scripts/observability/..."
  mkdir -p scripts
  cp -rn "$SCRIPT_DIR/plugins/signoff/scripts/observability" scripts/
  chmod +x scripts/observability/*.sh scripts/observability/*.py 2>/dev/null
fi

echo ""
echo "Done. One thing this script didn't set: the GitLab token."
echo "It's sensitive and is never passed on a command line. Run 'claude' interactively"
echo "once in this project and it'll prompt for it, stored in your OS keychain."
echo ""
echo "Dashboard: python3 scripts/observability/server.py - prints the port it's on,"
echo "runs until you stop it. Open it in a second terminal alongside your session."
echo ""
echo "Pipeline starts with cloud-engineer and finance-analyst - invoke them by name."
echo "cloud-engineer decides the cloud provider, not this script. Nothing here runs automatically."
