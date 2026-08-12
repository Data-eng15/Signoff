# Vision: Signoff as a forward-deployed engineering service

## The core idea

Signoff is not a product we sell as a license. It is the internal
harness that lets an entry-level or junior developer, trained on Claude Code,
deliver senior-level judgment on a client engagement. The pipeline (research,
finance and business case, architecture, UI/UX, PM breakdown, dev, test,
devops) encodes the sequencing, guardrails, and review discipline that would
normally require a senior engineer or architect to hold in their head. The
junior brings the client relationship and the hands on the keyboard; the kit
brings the judgment - and the name is literal: nothing moves to the next
stage without a real, tested signoff, not a click-through.

## Where this fits with CyRA

CyRA already does the diagnosis: it tells a small company where it is
lagging on AI readiness and what it needs. That diagnosis is currently a
dead end unless the company already has the talent to act on it. Signoff
is the delivery mechanism that turns a CyRA finding into actual shipped work.
CyRA finds the gap. Signoff staffs it, using our own people, at a
fraction of the cost of a traditional senior hire.

## The two-tier model

Tier one, for small clients (three to four person teams, limited budget):
license or staff access to Signoff itself. A trained junior developer,
credentialed on Claude Code, runs the client's project through our pipeline.
We are selling delivery capability plus judgment, not a subscription to a tool.

Tier two, for clients ready to scale: a heavier custom harness, likely
LangGraph based, built specifically around their systems rather than the
general-purpose Claude Code pipeline. This is the second-level offering once
a client outgrows tier one.

## The industry term for this role

Forward-deployed engineer. Someone who sits inside a client's specific
context and configures a general-purpose platform to that client's exact
problem, rather than building bespoke software from zero. This is the
role tier-one junior developers would effectively be trained into.

## What makes this defensible

Not the underlying platform. Claude Code, or whatever agent runtime
replaces or supplements it, is not our IP and never will be. What is
defensible: the pipeline discipline itself (the ordering, the review gates,
the guardrails that stop an agent from doing the wrong thing at the wrong
time), the accumulated project and client memory the agents build up over
repeated engagements, and the observability layer that lets us see exactly
where agents fail and fix it faster than a competitor with a looser setup.

## What has to be proven before this is real

That Signoff produces a measurably better outcome than a competent
junior using Claude Code with no kit at all. That is the actual pitch, and
right now it is unproven. The plan to prove it: finish building the full
pipeline, run one real project through it end to end as the first internal
test, log everything through the observability dashboard, then extend
access to a small number of real users for genuine feedback before treating
any part of this as a settled business model.

## What this document is not

This is not a committed business plan. It is a vision note to bring to
co-founders for discussion, written at the point where the underlying
pipeline is far enough along to make the idea concrete rather than abstract.
