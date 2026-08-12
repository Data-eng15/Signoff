# Signoff

One repo, two plugins, reused across every project.

- **`signoff`** — the project pipeline (devops-engineer, research, mcp-provisioner, cloud-engineer, finance-analyst, business-analyst, system-architect, architecture-critic, ui-ux-designer, pm-coordinator, frontend-developer, backend-developer, manual-tester, automation-tester), plus `security-auditor` — on demand, not part of the pipeline, audits the kit's own hooks/agents/MCP config rather than the client project's code. Install **per project**, `--scope project`, configured by parameters.
- **`career-coach`** — tracks your own growth across every project *and* coaches the actual job search (JD fit review, Notion-backed application tracking, job discovery), using persistent memory that survives leaving any single repo. Install **once**, `--scope user`, not per project. Run it directly with `claude --agent career-coach` (or set it as the default agent in a project's `.claude/settings.json`) rather than delegating to it — no manual file placement needed, the installed plugin agent is already resolvable by name.

## One-time setup (per machine, not per project)

```bash
./setup-machine.sh
```

Registers this repo as a marketplace and installs `career-coach` at user scope. Override the source once this repo is pushed to GitLab/GitHub if you want every machine pulling the same canonical copy — see the comment at the top of the script.

## Per new project

Your actual daily habit, once `setup-machine.sh` has run on this machine:

```bash
git clone <fresh-empty-project-repo> && cd <repo> && claude
```

Then, inside Claude Code:

```
/new-project client-x-poc strict
```

One command, typed where you're already sitting after `claude` starts — installs `signoff` with those parameters, reloads plugins, and scaffolds the repo, all in the same session, with normal permission prompts throughout since it's not running headless.

`new-project.sh` (the standalone shell script) still exists for when you want it non-interactive instead — bulk-creating several project repos in one script, or automation that shouldn't need a live Claude Code session. That version needs `--permission-mode acceptEdits` since nothing can prompt in headless mode; the in-session `/new-project` command doesn't.

```bash
/path/to/signoff/new-project.sh client-x-poc strict
```

Either way: `--scope project` writes the install to `.claude/settings.json` and commits it, so it reaches anyone who clones the repo — including your junior dev. And neither path ever passes `gitlab_token` on a command line; it's prompted for separately and stored in the OS keychain, not a file.

## How a project actually starts, stage by stage

1. `devops-engineer` — sets up the empty repo shell and environment first. Nothing to review yet, so this stage isn't gated.
2. `research` (DISCOVER mode) — turns the raw idea into a scoped, cited document before anything else touches it. Writes `docs/research-discover.md`.
3. Checkpoint interview on `research-discover` — hard-gated: `mcp-provisioner` and `cloud-engineer` can't start until this is logged.
4. `mcp-provisioner` — reads `research-discover.md`, recommends which project-specific MCPs each downstream agent needs. Recommends only; you approve and wire in.
5. `cloud-engineer` — rough technical feasibility, cloud provider choice, and cost, reading `research-discover.md`. The provider is decided here, not assumed anywhere upstream.
6. `finance-analyst` — go/no-go business case, reads cloud-engineer's estimate.
7. Checkpoint interview on the business case — gates `business-analyst`.
8. `business-analyst` — SRS.
9. Checkpoint interview on the SRS — gates `system-architect`.
10. `system-architect` — architecture doc, ADRs, API contract, data model, security considerations.
11. `architecture-critic` — adversarial pass on `docs/architecture.md` before you're tested on it: hunts for the wrong-problem, expensive-to-reverse-schema, scaling-blocking-coupling class of mistake that a Review Questions interview about your *understanding* won't catch, because the document itself is what's wrong. If it finds something real, `system-architect` revises and `architecture-critic` re-checks before the next step.
12. Checkpoint interview on the architecture — gates `ui-ux-designer`. Won't run until `architecture-critic`'s findings are either none or resolved.
13. `ui-requirements-gate` skill — asks the process-level questions (brand constraints, first-pass-vs-revision, out-of-scope screens, whether a connected design tool is authoritative) `ui-ux-designer` has no way to ask itself once it's running. Skip it and `ui-ux-designer` falls back to `NEEDS_CLARIFICATION` for anything it can't resolve alone.
14. `ui-ux-designer` — user flows, screen breakdown, component inventory, design system, reading the SRS and the approved architecture. Writes `docs/design.md`.
15. Checkpoint interview on the design — gates `pm-coordinator` and `frontend-developer`.
16. `project-intake` skill — same idea as `ui-requirements-gate`, for `pm-coordinator`: sprint length, first-pass-vs-revision, GitLab issue creation preference.
17. `pm-coordinator` — story breakdown, sprint plan with decision records for non-obvious sizing/sequencing calls, flags which stories are independently parallelizable. Reads the SRS and the design doc, so UI-heavy stories are sized against real screens and components, not guessed from prose.
18. Checkpoint interview on the sprint plan — gates `frontend-developer`, `backend-developer` alongside the architecture and design checkpoints above. Tests the decision records with the same rigor as architecture's ADRs, not just whether the estimates sound right.
19. `frontend-developer` / `backend-developer` build — as an agent team if pm-coordinator flagged genuinely independent stories, sequential subagents otherwise. `frontend-developer` builds against `docs/design.md`'s screen and component spec directly, not just the issue's acceptance criteria.
20. `manual-tester` and `automation-tester` verify.
21. `standup` skill, end of day.
22. `research` (INVESTIGATE / CHALLENGE modes), on demand mid-sprint — a specific technical question, or a "do we actually need this" necessity check. Not gated, not tied to a pipeline position.
23. `career-coach`, whenever you want a read on your own progress — separate from all of the above, spans every project.

No subagent auto-delegates. You invoke each one by name; the CLAUDE.md this scaffolds says so explicitly, and the default permission mode means every spawn — proposed or requested — still prompts you before it runs.

## Updating every project at once

Edit this repo, bump `version` in the relevant plugin's `plugin.json`, push. In each project:

```bash
claude plugin update signoff
```

This is the "append changes with instructions" part — you edit the source of truth once, not three repos separately.

## Observability dashboard

Every project gets a local dashboard at `scripts/observability/` — real-time event log, per-agent token/cost breakdown, checkpoint-review status, and a handover-report generator, all served on one port with no external dependencies beyond `pip install -r scripts/observability/requirements.txt`.

```bash
cd your-project-repo
pip install -r scripts/observability/requirements.txt --break-system-packages   # once
python3 scripts/observability/server.py                                        # prints the port, e.g. 8787
```

Leave it running in its own terminal for the life of the project — it has no idle timeout and doesn't stop itself; stop it yourself (Ctrl+C) when the project's actually done. It tails `.claude/logs/events.jsonl`, written by five hooks (PreToolUse, PostToolUse, SubagentStart, SubagentStop, Stop) that ship with this plugin — nothing to configure, they're already in `hooks.json`. The "Handoff spec" tab in the dashboard itself has the full wiring detail (endpoints, event schema, what's live vs. what's an estimate).

The **Report** tab generates `docs/handover-report.md` on demand — tracked work time, tokens and estimated cost, which pipeline stages were reviewed, real decisions pulled from every `Alternative considered` / `Why rejected` block your agents wrote into `docs/*.md`, and open flaws (hook blocks, held review gates). It's assembled from what's actually on disk, not LLM-generated narrative — a real handover doc, not a summary of one.

## Known gaps to fill in before this is actually production

1. **`.mcp.json`** has a placeholder `command` for the GitLab MCP server. Point it at whichever GitLab MCP server you settle on — I didn't want to hardcode a package name I wasn't certain still resolves.
2. **`bootstrap-project` scaffolds file content by instruction, not byte-for-byte template substitution** — Claude reads the skill (with `${user_config.*}` already substituted) and writes the files itself. Spot-check the first couple of runs before trusting it blind.
3. **No hard path-guard on devops-engineer** — plugin-shipped agents can't carry hooks. MR review is the real backstop for "did devops touch something outside its lane," not a technical block.
4. **The review-gate hook enforces that a checkpoint interview happened, not that it was rigorous.** A rushed, low-effort interview still logs as reviewed. That part is still on your own discipline.
5. **Verify the attribution fix on your first real commit, don't just trust the config.** Run `git log -1` after Claude makes a commit and check there's no `Co-Authored-By` line. The `attribution` setting in `.claude/settings.json` has documented cases of not being fully honored on its own — the hook is the real backstop, but confirm it's actually catching things rather than assuming both layers work silently.
6. **Check `git config user.name` / `user.email` on your machine are set to you**, not left at a default. That's what actually puts your name on the commit as author — the attribution setting only controls the co-author trailer, not primary authorship.
7. **`/new-project` lives at `~/.claude/commands/new-project.md`, a plain symlink into this repo.** If you ever move or delete this local clone without updating the symlink, the command breaks with a dangling-link error, not a helpful one. If you clone this repo to a new path, rerun `setup-machine.sh` to re-point it.
8. **The observability dashboard is vendored (physically copied) into each project's `scripts/observability/`, not referenced live from the installed plugin.** `claude plugin update signoff` won't update an already-vendored copy — rerun the vendoring step in `new-project.sh` (or copy manually) if you want a newer version of the dashboard itself in an existing project. This was a deliberate trade-off: the server needs a stable path to run from outside a hook context, where `CLAUDE_PLUGIN_ROOT` isn't set.
9. **`emit_event.py`'s field-name assumptions for `SubagentStart`/`SubagentStop` payloads weren't confirmed against a live Claude Code session** — this was built and tested with synthetic hook JSON, not a real one. Check the first real project's `.claude/logs/events.jsonl` against what you expected; if `agent` or `usage` comes through empty where it shouldn't, the field-name candidates are in `first(...)` calls near the top of `emit_event.py`, easy to extend.
10. **Cost figures are more real than "estimate" implied, but they were wrong until this session.** Token counts in the dashboard and handover report are actual measured usage from hook payloads, not invented — the only assumption was the $/Mtok conversion rate, and it was pointing at `claude-sonnet-4-5` pricing while every agent here actually runs `model: sonnet`, which resolves to Sonnet 5. Fixed as of this session (`config/rates.json` now has Sonnet 5/Opus 5/Haiku 4.5/Fable 5 at verified current rates, dated). This will drift again the next time Anthropic changes a rate or ships a new model — nothing here checks that for you, re-verify against `platform.claude.com/docs/en/about-claude/pricing` periodically rather than trusting the file indefinitely.
11. **`architecture-critic` is untested.** Run a project through `system-architect` → `architecture-critic` → checkpoint-review and confirm the findings section actually lands in `docs/architecture.md` in a shape checkpoint-review can check for, and that a real finding (not just a "none") actually triggers a system-architect revision before the interview proceeds.
12. **`security-auditor` exists but hasn't actually been run against this repo yet.** Run it once before shipping the kit to any client site, and treat the first output as a baseline to work through, not a clean bill of health — several of the gaps above (the `.mcp.json` placeholder, `Bash` on `devops-engineer`) are exactly the kind of thing it's built to flag, so expect it to surface things already known and listed here alongside anything new.
13. **`career-coach`'s `mcp__notion` / `mcp__indeed` tool grants are untested.** Run `claude mcp add --transport http --scope user notion https://mcp.notion.com/mcp` (use `--scope user`, not the default, or the server won't be there when you invoke career-coach from outside whichever directory you happened to run `mcp add` in). Indeed's connector may not authenticate through the CLI at all — if so, career-coach is written to fall back to WebFetch on a specific posting URL rather than block, but confirm that's actually how it behaves on first use, not just how it's written.
14. **`project-intake` and `ui-requirements-gate` now exist, but are untested end-to-end.** Run a project through `ui-requirements-gate` → `ui-ux-designer` → checkpoint-review, and separately `project-intake` → `pm-coordinator` → checkpoint-review, and confirm the brief actually reaches the agent as a fixed constraint rather than something it re-asks about anyway. Also confirm `pm-coordinator`'s new decision records actually show up in `docs/sprint-plan.md` in a shape checkpoint-review can interview against — this was written but never run against a real SRS.
15. **`mcp__context7` on `frontend-developer` and `backend-developer` is untested.** Run `claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp` (add `--header "Authorization: Bearer YOUR_KEY"` if you want a Context7 API key for higher rate limits — not `CONTEXT7_API_KEY: YOUR_KEY`, that header name is for the local stdio install method, not this remote one). Confirm both agents actually degrade gracefully when it's not connected rather than erroring on the unresolved tool entry.


