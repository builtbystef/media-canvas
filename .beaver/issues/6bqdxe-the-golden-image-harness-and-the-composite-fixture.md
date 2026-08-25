---
id: 6bqdxe
title: The golden-image harness and the composite fixture
state: in-progress
priority: medium
labels:
    - needs-review
depends_on:
    - jnih1z
    - r0w3w6
    - f2hjkt
    - zycblh
    - d2v61j
parent: 1qoccb
created: 2026-08-15T05:49:36Z
updated: 2026-08-25T16:42:33Z
---

## What to build

A check that catches the day a render stops matching what it used to produce. It runs a fixture document through the whole path — values in, compiled, rendered — inside the pinned image, and compares the result against a baseline image committed to the repository. Baking a baseline is a separate, deliberate act that refuses to happen anywhere else, so a baseline can never be quietly re-recorded to make a failure go away.

Closure waits for user review.

## Acceptance criteria

- [ ] A golden check resolves, compiles, and renders a fixture inside the pinned worker image, and compares the output against a committed baseline with pixelmatch at `threshold: 0.1`.
- [ ] Worker-output goldens require zero differing pixels — a ratio of 0, not a count — so the pinned contract has no slack in it.
- [ ] One named cross-flavor parity fixture, comparing full Chromium against the `chrome-headless-shell` build that ships inside the same pinned image (6sfpv3), is the single fixture with a nonzero tolerance, at a maximum differing-pixel ratio of 0.006 — both flavors run inside the one image, so the comparison never spans environments. Worked example: the measured 0.534% of pixels differing at glyph edges passes; a one-line layout shift or a changed fill color does not.
- [ ] Baking baselines is a separate command that refuses to run outside the pinned image or against a mismatched environment tuple, and never runs as a consequence of a failing check.
- [ ] Baselines are committed to the repository as lossless PNGs, in ordinary Git — no LFS.
- [ ] The composite fixture from the render-fidelity prototype passes: linear gradient, shadow, alpha, ellipse clip, image crop, rotation, group opacity, vector, and wrapped text in one document.
- [ ] The re-bake policy is written down: the whole suite is re-baked only after a deliberate environment-tuple change, reviewed and committed together with the old and new tuples; an intended rendering change updates only the fixtures it affects, after review.
- [ ] Missing values, missing assets, and validation failures are covered by functional tests at the validation and compile seams, not by golden images.

## Notes

**claude** — 2026-08-17T04:00:39Z

Decision: both flavors of the parity fixture run inside the one pinned image - 6sfpv3 now ships the paired chrome-headless-shell alongside full Chromium, so the comparison never spans environments.

**agent** — 2026-08-25T16:22:25Z

Seams (AFK): the spec already named seam 3 — render, inside the pinned image. The golden check is that seam: validate → resolve → compile → render(svg) → pixelmatch against a committed baseline. Host-testable pieces of the same contract: the comparator (threshold 0.1, worker ratio 0, parity ratio 0.006), the bake command's refusal to run outside the image or against a mismatched tuple, and the composite fixture document (it compiles; it is the prototype hard case). The in-image check is the one that must pass the fixture. Missing values/assets stay at seams 1–2; this issue adds no goldens for them.

**agent** — 2026-08-25T16:42:31Z

Built the golden harness and the composite fixture. Closure waits for user review.

What landed
- In-image check `src/checks/golden.check.ts`: validate → resolve → compile → render → pixelmatch. Worker-output goldens at threshold 0.1 / ratio 0. The named cross-flavor parity fixture renders the same composite through full Chromium and chrome-headless-shell inside the one image, at ratio 0.006.
- Separate bake command `pnpm --filter worker run goldens:bake`. It refuses outside the pinned image (PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers must exist) and against a mismatched environment tuple. The check never writes a baseline.
- Composite fixture is the prototype hard case, restated in the v1 schema: linear gradient (angle 45 for the old diagonal), shadow, alpha sun, ellipse-clipped crop, rotation, group opacity 0.85, vector star, wrapped Oswald/Inter text. It compiles on the host.
- Re-bake policy: apps/worker/goldens/README.md.

Decisions
- Parity reuses the composite document (that is the picture the prototype measured 0.534% on) and has no committed baseline — two live renders.
- pixelmatch 7.2.0 is vendored (ISC) at src/goldens/pixelmatch.js. This session cannot reach the npm registry. checkerboard: false matches the pre-v7 white blend the 0.006 figure was calibrated against.
- PNG read/write is a small RGBA8 codec in src/goldens/png.ts (Chromium screenshots and the bake path). pngjs was not added for the same registry reason. Bake writes Chromium's own lossless PNG bytes.
- renderWith(build, svg, options) is the parity-only cousin of render(); the production path still launches only full Chromium.
- Badge/headline use Oswald Bold (the face the compile worked example measures); body uses Inter Regular. Lato is not in the bundled set.

Not done in this session — needs the reviewer
- Docker is denied here, so goldens:bake was not run and composite.png is not committed. image:check will fail the composite until someone bakes inside the pinned image and commits the PNG.
- Close this issue to approve, or note requested changes and remove needs-review.
