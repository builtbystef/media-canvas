---
id: vmz1ew
title: The editor end-to-end smoke
state: todo
priority: medium
depends_on:
    - uemwae
    - h66j4l
    - hjniam
parent: ek7pq1
created: 2026-08-15T07:12:59Z
updated: 2026-08-29T06:26:31Z
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
