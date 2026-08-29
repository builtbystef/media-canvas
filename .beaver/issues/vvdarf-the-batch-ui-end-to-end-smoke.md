---
id: vvdarf
title: The batch UI end-to-end smoke
state: done
assignee: agent
priority: medium
depends_on:
    - 39y4fh
    - 047evd
    - thh7aw
    - aw1dup
parent: wz3ev2
created: 2026-08-15T07:29:20Z
updated: 2026-08-29T08:25:33Z
---

## What to build

One pass through the whole thing, driven the way an operator drives it, against the real stack rather than stand-ins. A template is opened, a small CSV is uploaded and previewed, the batch is submitted, the job's page is watched until it completes, and both ways out — one file and the archive — are taken. It proves that this spec's client and the generation platform underneath it agree about formats, query parameters, addresses, and states; everything finer than that is already covered by the pure-logic tests.

## Acceptance criteria

- [ ] One browser-driven test runs against a running development stack: open a template, open the generate dialog's batch tab, upload a two-row CSV, see the mapping summary, submit, land on the job's page, watch it reach completed, download one Row's output, and download the archive.
- [ ] The archive downloaded by that test holds two entries.
- [ ] The test asserts on what is visible and what was downloaded, never on internal state.
- [ ] It is not part of the ordinary test command, and the project's documentation says how to run it and what must be running first.
- [ ] It was executed against a real stack in the session that closes this issue, with its output reported rather than assumed.

## Notes

**agent** — 2026-08-29T08:18:19Z

Seam: Playwright against the real running stack (architecture's browser ↔ application origin), not Vitest and not the api smoke. One scripted pass asserts on what is visible and what was downloaded — mapping summary, job page reaching Completed, one Row file, the archive's two entries. Fine-grained behavior stays at seam 1. Not part of pnpm test.

**agent** — 2026-08-29T08:25:32Z

Built the batch UI end-to-end smoke.

**What landed.** One Playwright pass at `tools/browser-smoke/batch-smoke.e2e.ts`: sign in, open a template (design → text → promote → declare and bind `headline`), Generate → Batch, upload a two-row CSV, see the mapping summary (matched `headline`, row-name column recognized), submit, land on `/jobs/{id}`, wait until the page says Completed, download Row `one` as a PNG, download the archive and assert two entries. `pnpm smoke:batch` runs it; it is not part of `pnpm test`. README documents how to run it and that the development stack must be up first.

**Seam.** Spec seam 2 / architecture browser ↔ application origin. Asserts on visible copy and downloaded bytes only.

**Executed this session (not assumed)**
- Development stack already up: api :8000 `{"status":"ok","database":{"connected":true,"schema_at_head":true}}`; web :3000; worker :4000; compose postgres/redis/garage Healthy.
- `SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:batch`: 1 passed in 11.0s.
- `pnpm check` green. `pnpm test`: 467 TypeScript + 200 api pytest (this smoke not among them).

**Decisions a reviewer should know.**
- Follows the editor smoke: Chromium only, `test.step` names, sign-in via `.dev/mailer.log` / `docker compose logs api`. Included in `pnpm smoke:browser` via `*.e2e.ts`.
- Navigation to the job page waits up to 60s so a cold `next dev` compile of `/jobs/[id]` is not a flake.
- Zip entry names are read from the downloaded file's central directory; no extra dependency.
- No review gate on this slice.
