---
id: ud46e4
title: What golden-image tolerance and baseline process catches render regressions in the pinned-Chromium pipeline?
state: todo
labels:
    - roadmap:v1xa7j
    - session:research
depends_on:
    - gqr8bf
parent: v1xa7j
created: 2026-08-10T03:21:01Z
updated: 2026-08-10T03:21:01Z
---

Research (research skill, primary sources) how the render pipeline catches fidelity regressions, now that the engine is settled: one Chromium on both sides (node gqr8bf).

The prototype measured why byte equality is the wrong bar: Chromium differs from ITSELF by 0.534% of pixels across headless flavors (headless-shell vs full build, glyph-edge antialiasing only, zero layout drift). Evidence and a reusable diff harness: branch prototype/render-fidelity (pixelmatch at threshold 0.1; timings.json has the figures).

Settle, citing primary sources:
- The diff metric and pass tolerance: pixelmatch threshold + max-differing-pixel ratio (what do Playwright's toHaveScreenshot defaults use and why), vs perceptual metrics (SSIM, Skia Gold's approach). What tolerance admits AA drift (~0.5%) but catches a real layout or color regression?
- The golden set: which documents (the prototype's hard-case doc covers gradient, shadow, clip, crop, rotation, group opacity, wrapped text — what else earns a golden?).
- Baseline storage and re-bake policy: where baselines live (repo, LFS?) and when they are regenerated (Chromium version bump, font set change — both are pinned inputs per gqr8bf's verdict).
- Where the check runs: worker image only (the pinned environment) — baselines rendered on a dev laptop are invalid by construction; confirm this against Playwright's documented per-platform snapshot behavior.

Deliverable: a recommended metric + tolerance + baseline process with citations and any measurements, ready for the core-area spec (node 6lxoec) to adopt.
