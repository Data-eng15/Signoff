---
description: Generates an end-of-day standup update (yesterday/today/blockers) from actual GitLab activity - commits, MR status, and issue moves. Use at end of day before the real standup.
---

Pull today's activity for project "${user_config.project_slug}": commits since this morning, MR status changes, and issue/story moves on the board.

Produce a standup update in this format:

**Yesterday** (or "today" if run mid-day): what actually shipped or moved, referencing issue numbers, not vague summaries.
**Today**: what's in progress right now, per the board's "In Progress" column.
**Blockers**: anything stuck, with how long it's been stuck.

If nothing moved on an issue that was "In Progress" yesterday, say so explicitly rather than omitting it — a stalled story is exactly what a standup should surface, not smooth over.
