---
id: vmz1ew
title: The editor end-to-end smoke
state: done
assignee: agent
priority: medium
depends_on:
    - uemwae
    - h66j4l
    - hjniam
parent: ek7pq1
created: 2026-08-15T07:12:59Z
updated: 2026-08-29T07:52:38Z
---

## What to build

One scripted pass over the whole editor, against the real stack, as proof that the pieces are wired to each other and not only to their tests. It walks the path a first-time user walks: make a design, put something on it, watch it save, come back to it, promote it, give it a Variable, and get a file out. Fine-grained behavior is covered by the unit seam; this exists to catch the wiring.

## Acceptance criteria

- [ ] The smoke creates a design from a canvas preset, draws a rectangle and a text element, waits for the indicator to reach saved, reloads, and finds the document intact.
- [ ] It then promotes that design, declares a Variable, binds it, and generates a PNG, receiving the file as a download.
- [ ] It runs against the real development stack rather than stubs, and lives outside the ordinary test command, with the command to run it documented.
- [ ] It runs in a Chromium-based browser only, matching the product's stated support.
- [ ] A failure names the step it failed at, so the run is diagnostic rather than a single red mark.
- [ ] The run was executed and its output reported in the session that closes this issue.

## Notes

**claude** — 2026-08-17T04:00:39Z

Confirmed: the review gate on this smoke is intentional and stays. The slicing note authorized two in-editor review gates (n5csrl, glkll2); this one is the corpus-wide closing-smoke pattern every spec except wz3ev2 follows, not a third in-editor gate.

**agent** — 2026-08-29T06:26:31Z

Per-issue review gate lifted 2026-08-29, superseding the 2026-08-17 note that the gate stays: close this issue when the acceptance criteria are met, including executing the smoke and reporting output. The user will review the implement-loop run's full diff rather than gating closure here.

**agent** — 2026-08-29T07:47:19Z

Seam (AFK, parent spec Testing Decisions #3): one Playwright pass in tools/browser-smoke against the real development stack (pnpm dev / Compose), not Vitest and not the FastAPI test client. Chromium only. Failures are named test.step titles so a red run says which wiring step broke.

**agent** — 2026-08-29T07:52:36Z

Seam: Playwright against the real development stack (tools/browser-smoke/editor-smoke.e2e.ts). Not Vitest, not the FastAPI test client, not pnpm test.

Built
- One scripted pass: Canvas Preset (Instagram post) → draw rect + text → wait until Saved → reload intact → Promote to Template → declare headline → bind {{headline}} → generate PNG download (Untitled.png, PNG signature).
- Each criterion is a named test.step, so a failure names the step.
- Chromium only: playwright.config projects pin browserName chromium; the test also skips any other browserName.
- Command: SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:editor (pnpm dev). pnpm smoke:browser includes this pass against the Compose app profile. README documents both. Sign-in codes from .dev/mailer.log or docker compose logs api.

Executed this session (not assumed)
- pnpm dev already up: web :3000, api :8000, worker :4000; compose postgres/redis/garage Healthy.
- SMOKE_BASE_URL=http://localhost:3000 pnpm smoke:editor
  [chromium] › editor-smoke.e2e.ts:22:1 › the editor end-to-end smoke
  1 passed (13.5s)
- pnpm check green; pnpm test: 467 TypeScript + 200 api pytest (editor smoke not among them).

Decisions
- Lives next to the accounts browser smoke, not a third package: same Playwright install, same Chromium pin, same on-demand command family.
- Binding is the text token {{headline}}, the first-time-user path, not a fill BindControl.
