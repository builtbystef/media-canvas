---
id: thh7aw
title: The documented bootstrap and the end-to-end smoke
state: todo
priority: medium
depends_on:
    - 211q1b
    - qqzqhz
    - jr6mye
    - vn4r07
parent: 0egsmf
created: 2026-08-15T06:54:47Z
updated: 2026-08-29T06:26:31Z
---

## What to build

A fresh clone becomes a running stack that renders a batch, by following the README and nothing else. The bootstrap sequence is executed, not merely written; then one test drives the real stack the way a user would — submit a two-row batch, poll it to completion, download the archive — which proves that the api, the worker, the queue, the database, and object storage are wired to each other and not only to their stand-ins.

## Acceptance criteria

- [ ] The README documents the bootstrap in order: infrastructure up and healthy, dependencies installed for both runtimes, migrations applied, then the development command. Someone following it from a clean clone reaches a running stack with no undocumented step.
- [ ] The README states plainly that the development worker uses a locally installed browser and that its output is never valid for golden baselines — the pinned image is for baselines, CI, and production.
- [ ] A smoke test against the running stack submits a two-row batch, polls until the Job completes, and downloads an archive containing two entries.
- [ ] The smoke's Template uses a bundled font and a held image, so the worker's asset path is exercised rather than bypassed.
- [ ] The smoke is not part of the ordinary test command, and the README says how to run it and what it needs running first.
- [ ] Every step above was executed against a real stack in the session that closes this issue, with the output reported rather than assumed.

## Notes

**claude** — 2026-08-15T07:13:26Z

Retargeted 2026-08-15 (ek7pq1 issue-slicing session): the placeholder edge on the ek7pq1 umbrella is replaced by edges on the slices that actually gate this work. No umbrella edges remain anywhere in the tracker.

**agent** — 2026-08-29T06:26:31Z

Per-issue review gate lifted 2026-08-29: close this issue when the acceptance criteria are met, including executing the smoke and reporting output. The user will review the implement-loop run's full diff rather than gating closure here.
