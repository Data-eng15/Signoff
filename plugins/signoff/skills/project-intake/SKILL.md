---
description: Runs before pm-coordinator, in the main session where AskUserQuestion is available - asks Soham the process-level questions pm-coordinator can't ask itself once it's running as a delegated subagent (sprint length, capacity, GitLab issue creation preference, first pass vs revision), then hands pm-coordinator a fixed brief instead of leaving it to guess or silently default. Use once, right before invoking pm-coordinator, whenever docs/design.md has just cleared checkpoint-review.
---

pm-coordinator can't use AskUserQuestion - it's a Task-tool subagent, and that tool is stripped from every subagent regardless of what's in its `tools:` field. Anything it would need to ask mid-run has to be settled before it starts instead. That's your job here.

Check first, ask only what's left. Don't ask something this project's config or an existing docs/sprint-plan.md already answers:

1. **Sprint length** - default is one week per this project's playbook. Confirm it or get the override.
2. **First pass or revision?** Check docs/sprint-plan.md yourself before asking. If it already exists, ask what specifically needs to change - don't have pm-coordinator silently redo the whole plan when you meant to add three stories.
3. **GitLab issue creation.** If the gitlab MCP is connected, ask whether pm-coordinator should create the issues directly or just draft docs/sprint-plan.md for Soham to create himself.
4. **Fixed external deadline**, if any, this sprint plan needs to work backward from. Optional - skip if there isn't one.

Ask one at a time with AskUserQuestion where the answer is a clean set of options (sprint length, first-pass-vs-revision, GitLab creation). Ask directly in conversation for anything open-ended (what specifically changed, the deadline if any).

Once you have answers, invoke pm-coordinator and state them as fixed constraints in the task prompt - not as suggestions it should weigh, as given:

> Sprint length: 2 weeks, not the 1-week default. This is a revision to an existing sprint plan - read the current docs/sprint-plan.md before adding anything. Draft only, don't create GitLab issues.

pm-coordinator treats whatever you hand it here as settled. It shouldn't re-derive or second-guess a constraint you already answered.

If someone skips this skill and invokes pm-coordinator directly, it falls back to writing NEEDS_CLARIFICATION for anything process-level it can't resolve on its own - see pm-coordinator.md's Phase 0.
