---
id: 6bqdxe
title: The golden-image harness and the composite fixture
state: todo
priority: medium
depends_on:
    - jnih1z
    - r0w3w6
    - f2hjkt
    - zycblh
parent: 1qoccb
created: 2026-08-15T05:49:36Z
updated: 2026-08-15T05:49:36Z
---

## What to build

A check that catches the day a render stops matching what it used to produce. It runs a fixture document through the whole path — values in, compiled, rendered — inside the pinned image, and compares the result against a baseline image committed to the repository. Baking a baseline is a separate, deliberate act that refuses to happen anywhere else, so a baseline can never be quietly re-recorded to make a failure go away.

Closure waits for user review.

## Acceptance criteria

- [ ] A golden check resolves, compiles, and renders a fixture inside the pinned worker image, and compares the output against a committed baseline with pixelmatch at `threshold: 0.1`.
- [ ] Worker-output goldens require zero differing pixels — a ratio of 0, not a count — so the pinned contract has no slack in it.
- [ ] One named cross-flavor parity fixture, comparing full Chromium against the headless shell, is the single fixture with a nonzero tolerance, at a maximum differing-pixel ratio of 0.006. Worked example: the measured 0.534% of pixels differing at glyph edges passes; a one-line layout shift or a changed fill color does not.
- [ ] Baking baselines is a separate command that refuses to run outside the pinned image or against a mismatched environment tuple, and never runs as a consequence of a failing check.
- [ ] Baselines are committed to the repository as lossless PNGs, in ordinary Git — no LFS.
- [ ] The composite fixture from the render-fidelity prototype passes: linear gradient, shadow, alpha, ellipse clip, image crop, rotation, group opacity, vector, and wrapped text in one document.
- [ ] The re-bake policy is written down: the whole suite is re-baked only after a deliberate environment-tuple change, reviewed and committed together with the old and new tuples; an intended rendering change updates only the fixtures it affects, after review.
- [ ] Missing values, missing assets, and validation failures are covered by functional tests at the validation and compile seams, not by golden images.
