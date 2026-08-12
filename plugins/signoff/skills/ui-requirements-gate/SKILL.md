---
description: Runs before ui-ux-designer, in the main session where AskUserQuestion is available - asks Soham the constraints ui-ux-designer can't ask about itself once it's running as a delegated subagent (fixed brand constraints not in the SRS, screens explicitly out of scope this pass, whether a connected design tool should be treated as authoritative, first pass vs revision), then hands it a fixed brief. Use once, right before invoking ui-ux-designer, whenever docs/architecture.md has just cleared checkpoint-review.
---

Same reason as project-intake: ui-ux-designer is a Task-tool subagent, so it has no AskUserQuestion once it's running. Settle what it would otherwise have to guess at before it starts.

Check first, ask only what's left. Don't ask something docs/srs.md or an existing docs/design.md already answers:

1. **Brand or style constraint fixed by the client that isn't in the SRS** - an existing logo, a mandated color, a component library already chosen. If there's nothing beyond what the SRS already says, skip this.
2. **First pass or revision?** Check for an existing docs/design.md yourself first. If it's a revision, ask specifically what needs to change - don't have ui-ux-designer silently redo flows and screens that already work.
3. **Anything named in the SRS that's explicitly out of scope for this pass** - deferred to a later phase, not actually being designed now.
4. **If a design/prototyping MCP tool is connected**, ask whether its output should be treated as authoritative or as a starting point Soham still expects to adjust by hand.

Ask directly in conversation, or with AskUserQuestion where the answer is a clean set of options (authoritative-or-not, first-pass-or-revision).

Once you have answers, invoke ui-ux-designer and state them as fixed constraints in the task prompt, the same way project-intake does for pm-coordinator - given, not something it re-derives.

If someone skips this skill and invokes ui-ux-designer directly, it falls back to writing NEEDS_CLARIFICATION for anything process-level it can't resolve on its own - see ui-ux-designer.md's Phase 0.
