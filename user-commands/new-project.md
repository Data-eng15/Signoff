---
description: Sets up a new project end to end - installs signoff with these parameters and scaffolds the repo. Run once, right after cloning a fresh empty project repo. Usage: /new-project <project_slug> [guardrail_level] [cloud_hint]
---

Parse $ARGUMENTS as up to three values: project_slug (required, first word), guardrail_level (second word if given, default standard), cloud_hint (everything remaining, default blank — leave this blank in almost every case; it's only for when Soham already knows the exact provider/region a client requires, not a normal starting assumption). If project_slug is missing, ask for it before doing anything else — don't guess one.

Then, as one continuous flow, not stopping to ask for confirmation between these steps unless one of them actually fails:

1. Run `claude plugin marketplace list` and check whether "soham-team-kit" is registered. If it isn't, tell Soham this machine hasn't had setup-machine.sh run yet and stop here rather than guessing a marketplace source. Note the marketplace's source path/URL from this output for step 6 — don't discard it.
2. Run `claude plugin install signoff@soham-team-kit --scope project --config project_slug=<parsed value> --config guardrail_level=<parsed value> --config cloud_hint=<parsed value, or omit this flag entirely if blank>`.
3. Run `/reload-plugins` so the newly installed plugin's agents and skills are available in this session without a restart.
4. Run the bootstrap-project skill now that it's loaded.
5. Tell Soham plainly that the GitLab token is sensitive and wasn't set here — it gets prompted for separately the first time a GitLab-dependent agent actually needs it, and goes to the OS keychain, not a file.
6. Vendor the observability dashboard into this project: if the marketplace source noted in step 1 is a local filesystem path, copy `<that path>/plugins/signoff/scripts/observability` into `scripts/observability` in this repo (skip any file that already exists, don't overwrite local edits). If the marketplace source is a remote git URL instead, tell Soham the dashboard needs vendoring from a real clone — either run `new-project.sh` instead for this project (it does this step automatically from a local checkout), or `git clone` that URL to a temp directory and copy from there — rather than guessing at a path that doesn't exist on this machine.
7. Tell Soham the dashboard starts with `python3 scripts/observability/server.py` — prints the port it's on, keeps running until stopped.
8. Remind him the pipeline starts with cloud-engineer and finance-analyst, invoked by name, and that cloud-engineer — not this command — is what actually decides the cloud provider unless he gave a cloud_hint just now. Nothing in this kit runs automatically, including right now — don't chain into inviting one of those next as part of this same command.
