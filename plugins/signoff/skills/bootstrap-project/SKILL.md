---
description: Scaffolds the standard project structure (CLAUDE.md, docs/, .gitlab-ci.yml, Dockerfile, issue/MR templates) in the current empty repo, using this plugin's configured parameters. Use once, when a new project repo is created.
---

Scaffold the standard project structure in the current directory for project "${user_config.project_slug}" (guardrail level: ${user_config.guardrail_level}). Cloud provider and region aren't set here — that's cloud-engineer's call, made later during feasibility analysis, not something to assume at scaffold time.

If any of the files below already exist, ask before overwriting rather than clobbering existing project content.

Create these files:

**`CLAUDE.md`** — the code of conduct every session and subagent in this repo loads automatically:

```
# Code of Conduct — loaded automatically by every Claude Code session, subagent, and teammate in this repo

Project: ${user_config.project_slug} | Guardrail level: ${user_config.guardrail_level} | Cloud provider/region: see docs/cost-estimate.md (decided by cloud-engineer, not assumed here)

## Non-negotiables
- Never commit or push directly to main. Work on feat/<issue-number>-<slug> or fix/<issue-number>-<slug>, open an MR, wait for review.
- Every commit references an issue: #123: <what changed>.
- Every MR uses .gitlab/merge_request_templates/default.md.
- CI (lint + test) must pass before merge.
- No secrets in code or .env. Real values come from the cloud provider's secret store only (see docs/cost-estimate.md for which provider).
- Every cloud resource is tagged project=${user_config.project_slug} env=<dev|staging|prod> owner=soham.
- Never add a Co-Authored-By line, a "Generated with Claude Code" footer, or any AI attribution to a commit message or MR description. Every commit is authored by Soham only. This is enforced by a hook, not just this instruction — don't rely on the hook catching it, get it right the first time.

## Definition of Done
- Merged to main via a reviewed MR
- CI green
- Deployed to dev
- Verified against the issue's actual acceptance criteria

## Role boundaries
- devops-engineer subagent sets up the repo shell and environment first, before research or anything else runs
- research subagent runs DISCOVER once per project (before cloud-engineer, gated by checkpoint-review) to scope a raw idea into docs/research-discover.md, then stays available on demand for INVESTIGATE (a specific question) and CHALLENGE (a necessity check on a requirement) — not gated, not tied to a pipeline position, callable any time mid-sprint
- mcp-provisioner subagent runs once per project, right after research's DISCOVER pass is reviewed, and recommends which project-specific MCPs each downstream agent needs — recommends only, never wires anything in itself
- cloud-engineer subagent assesses technical feasibility and rough cost, reading docs/research-discover.md, before any SRS — not the same as devops-engineer, which provisions real infra later
- finance-analyst subagent assesses whether the idea is worth building, before any SRS
- business-analyst subagent owns docs/srs.md
- system-architect subagent owns docs/architecture.md
- ui-ux-designer subagent runs after system-architect, reads the SRS and the approved architecture, and owns docs/design.md — user flows, screen breakdown, component inventory, design system. pm-coordinator and frontend-developer build against this, not against the SRS alone.
- pm-coordinator subagent owns story breakdown and sprint/milestone assignment, reading the SRS and docs/design.md
- devops-engineer subagent owns infra/, .gitlab-ci.yml, Dockerfile, docker-compose.yml, docs/runbook.md
- frontend-developer subagent owns /src/frontend (UI code) — ${user_config.frontend_stack} — builds against docs/design.md's screen and component spec
- backend-developer subagent owns /src/backend (API code) — ${user_config.backend_stack}
- work that doesn't cleanly split frontend/backend goes to whichever of frontend-developer/backend-developer is the closer fit — flag the boundary call in the issue for Soham to confirm rather than silently absorbing the other side's scope. Independent stories can run as agent-team teammates instead of sequentially.
- manual-tester subagent verifies by actually running the app — read-only, on purpose
- automation-tester subagent owns /tests, the repeatable suite

## Orchestration rules
- No subagent auto-delegates based on task matching. Only invoke one when Soham explicitly names it — if a task looks like it fits a pipeline role, say which subagent you'd use and let him confirm, don't just spawn it.
- Never spawn more than one subagent, or an agent team, without asking first in plain language — even though the permission system would block an unapproved spawn anyway, don't rely on that as the only check.
- Stages run one at a time, in the order in docs/PROJECT-PLAYBOOK.md, gated by the checkpoint-review interview where one is required.

## Working with Soham
- Every deliverable (SRS, architecture doc, sprint plan, code) ends with the 2-3 key decisions made and why, including the alternative not chosen.
- Every review checkpoint includes one specific question for Soham to reason through himself before approving — not "does this look good," but the one place where his judgment, not the agent's, should decide.
- If a subagent is about to make a call Soham hasn't seen this pattern on before, it says so explicitly rather than just deciding silently.
```

**`docs/requirements.md`** — template with headers: Problem statement / Success criteria / In-scope & out-of-scope / User stories (Given/When/Then) / Technical constraints.

**`docs/runbook.md`** — template with headers: Deploy steps / Rollback steps / Known issues.

**`.gitlab-ci.yml`** — stages: lint, test, build, deploy-dev; standard skeleton with a lint and test job that runs on every MR.

**`.gitlab/issue_templates/feature.md`** — Context / Acceptance criteria (Given/When/Then) / Technical notes / Out of scope.

**`.gitlab/issue_templates/bug.md`** — Steps to reproduce / Expected vs actual / Environment / Severity / Regression?.

**`.gitlab/merge_request_templates/default.md`** — What changed and why / How I tested it / Linked issue (Closes #N) / Screenshots or demo link.

**`Dockerfile`** and **`docker-compose.yml`** — minimal Python/FastAPI starting point unless told otherwise.

**`.gitignore`** — if it already exists, append rather than overwrite; ensure these lines are present:
```
.claude/logs/
scripts/observability/__pycache__/
*.pyc
```
`.claude/logs/` holds events.jsonl and the observability dashboard's rollup.db - local runtime data, regenerated by hooks as the project runs, never committed.

**`.claude/settings.json`** — if it already exists, merge into it rather than overwriting; add:
```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  }
}
```
This is the project-level setting that turns off the Co-Authored-By trailer and PR footer. It's a known-to-sometimes-not-be-fully-reliable setting on its own, which is why the hook in this plugin also checks every commit directly — don't remove the hook thinking this setting alone is enough.

After creating the files, tell the person exactly what was created and remind them to tag cloud resources with project=${user_config.project_slug} once a provider is actually chosen.
