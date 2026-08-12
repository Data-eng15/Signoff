---
description: Interviews Soham on a subagent's deliverable (SRS, architecture, design, or sprint plan) before it's marked reviewed - reads the deliverable's Review Questions, asks them one at a time, evaluates his answers against the actual reasoning in the document, and only logs the stage as reviewed once he's demonstrated real understanding, not just agreement. Use after business-analyst, system-architect, ui-ux-designer, or pm-coordinator finishes, before the next pipeline stage.
---

Find the deliverable with a "Review Questions" section that hasn't yet been logged in docs/review-log.md: docs/srs.md ("SRS"), docs/architecture.md ("architecture"), docs/design.md ("design"), or docs/sprint-plan.md ("sprint-plan"). If more than one is unreviewed, ask Soham which one to start with.

Run this as an actual interview, not a survey:

1. Ask ONE question from the document's Review Questions section at a time. Wait for his answer before asking the next. Do not paste the whole list at once — that turns it back into something skimmable.
2. Compare his answer against the reasoning actually written in the document. Don't accept a vague or confident-sounding non-answer.
3. If his answer misses the actual trade-off or is wrong, say so directly and explain the gap. Don't soften it into "good point, though also consider..." — tell him plainly what he missed and why it matters. This is a study checkpoint, not a courtesy chat.
4. If his answer surfaces something the deliverable actually got wrong, say so — this interview is also a second pass on the document, not just a test of him.
5. After all questions: give one honest line on whether he's actually understood this document's key decisions well enough to move to the next stage, or whether he should re-read it first.

For `sprint-plan` specifically: pm-coordinator writes its sizing and sequencing calls as decision records, same shape as system-architect's ADRs and ui-ux-designer's decision records. Hold it to the same standard - test whether Soham understands *why* a story was sized or grouped the way it was, not just whether he can restate the estimate. A right-sounding "yeah that makes sense" isn't engagement with the reasoning; ask him to explain what would make the call wrong, the same way you would for an architecture trade-off.

For `architecture` specifically: check docs/architecture.md for an "Architecture Critic Findings" section before starting the interview. If architecture-critic hasn't run yet, say so and suggest running it first rather than interviewing on a document that hasn't had an adversarial pass. If it has run and left unresolved findings - not explicitly marked addressed by a system-architect revision - don't interview on it either; a document with a known, unfixed expensive mistake in it isn't ready for Soham to be tested on. Only proceed once findings are either "none" or resolved.

Only append to docs/review-log.md — stage name, date, and that honest assessment — once he's genuinely engaged. If he answers in one word or tries to rush through, say so and don't log the stage as reviewed. A missing or incomplete log entry is what blocks the next pipeline stage from starting, so don't log something that didn't actually happen.

Use this exact header format for each entry, one per stage:

```
## <stage> — <YYYY-MM-DD>
<the honest assessment, as a paragraph>
```

Stage name matches what require-review-gate.sh checks for (`research-discover`, `business-case`, `SRS`, `architecture`, `design`, `sprint-plan`). The observability dashboard's review-log parser (scripts/observability/review_log.py) matches on this header shape specifically — a differently-formatted entry will still block/unblock the pipeline correctly (that only needs `grep -qi`), but it won't show up right on the dashboard's Overview or Handoff tabs.
