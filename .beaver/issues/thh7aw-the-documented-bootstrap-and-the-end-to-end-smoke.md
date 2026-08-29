---
id: thh7aw
title: The documented bootstrap and the end-to-end smoke
state: done
assignee: agent
priority: medium
depends_on:
    - 211q1b
    - qqzqhz
    - jr6mye
    - vn4r07
parent: 0egsmf
created: 2026-08-15T06:54:47Z
updated: 2026-08-29T07:06:11Z
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

**agent** — 2026-08-29T06:56:10Z

Seam: public HTTP API against the real running stack (compose infra + pnpm dev), not the FastAPI test client or stand-ins. One pytest file at apps/api/smoke/generation_smoke.py — outside tests/ so conftest's fakes and the test database never load. It is not part of pnpm test.

**agent** — 2026-08-29T07:06:08Z

Seam: public HTTP API against the real running stack (compose infra + pnpm dev). Test in apps/api/smoke/generation_smoke.py — outside tests/, so conftest's fakes and the test database never load. Not part of pnpm test.

Built
- README bootstrap in order: cp .env.example .env → docker compose up -d --wait → uv sync → pnpm install → playwright-core install chromium → pnpm --filter api migrate → pnpm dev.
- README states the development worker uses a locally installed browser and that its output is never valid for golden baselines; the pinned image is for baselines, CI, and production.
- pnpm smoke submits a two-row batch (bundled Inter + a held PNG), polls to completed, downloads an archive of two entries (one.png, two.png).
- ConsoleMailer also appends to .dev/mailer.log so the smoke can read the sign-in code without sharing the api's stdout.

Executed this session (not assumed)
- docker compose up -d --wait: postgres, redis, garage Healthy
- uv sync; pnpm install (lockfile up to date)
- pnpm --filter worker exec playwright-core install chromium
- pnpm --filter api migrate (already at head)
- pnpm dev: api :8000 health {"status":"ok","database":{"connected":true,"schema_at_head":true}}; worker internal service on :4000
- pnpm smoke: 1 passed in 5.10s
- pnpm check green; pnpm test: 443 TypeScript + 200 api pytest (smoke not among them)

Decisions
- Smoke lives under apps/api/smoke/ rather than tests/, so pytest tests does not collect it and the TestClient/RecordingWorker never stand in.
- OTP is read from .dev/mailer.log first (pnpm dev), then docker compose logs api (compose app profile), then SMOKE_API_LOG.
