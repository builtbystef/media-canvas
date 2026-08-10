---
id: ud46e4
title: What golden-image tolerance and baseline process catches render regressions in the pinned-Chromium pipeline?
state: done
assignee: agent
labels:
    - roadmap:v1xa7j
    - session:research
depends_on:
    - gqr8bf
parent: v1xa7j
created: 2026-08-10T03:21:01Z
updated: 2026-08-10T06:40:44Z
---

Research (research skill, primary sources) how the render pipeline catches fidelity regressions, now that the engine is settled: one Chromium on both sides (node gqr8bf).

The prototype measured why byte equality is the wrong bar: Chromium differs from ITSELF by 0.534% of pixels across headless flavors (headless-shell vs full build, glyph-edge antialiasing only, zero layout drift). Evidence and a reusable diff harness: branch prototype/render-fidelity (pixelmatch at threshold 0.1; timings.json has the figures).

Settle, citing primary sources:
- The diff metric and pass tolerance: pixelmatch threshold + max-differing-pixel ratio (what do Playwright's toHaveScreenshot defaults use and why), vs perceptual metrics (SSIM, Skia Gold's approach). What tolerance admits AA drift (~0.5%) but catches a real layout or color regression?
- The golden set: which documents (the prototype's hard-case doc covers gradient, shadow, clip, crop, rotation, group opacity, wrapped text — what else earns a golden?).
- Baseline storage and re-bake policy: where baselines live (repo, LFS?) and when they are regenerated (Chromium version bump, font set change — both are pinned inputs per gqr8bf's verdict).
- Where the check runs: worker image only (the pinned environment) — baselines rendered on a dev laptop are invalid by construction; confirm this against Playwright's documented per-platform snapshot behavior.

Deliverable: a recommended metric + tolerance + baseline process with citations and any measurements, ready for the core-area spec (node 6lxoec) to adopt.

## Notes

**agent** — 2026-08-10T06:40:44Z

## Question

What golden-image tolerance and baseline process catch render regressions in the pinned-Chromium pipeline?

## Answer

Use Playwright `toHaveScreenshot` backed by pixelmatch with `threshold: 0.1` and `maxDiffPixelRatio: 0.006` for the explicit editor-versus-worker/cross-headless-flavor parity golden. This threshold admits the prototype measured 6,228 / 1,166,400 = 0.534% glyph-edge AA drift, with 0.066 percentage point headroom. This is a project recommendation derived from the measurement, not a Playwright default.

For canonical worker-output goldens, render and compare only in the one immutable worker image and require `maxDiffPixelRatio: 0` (with the same `threshold: 0.1`). The 0.6% allowance is only for the specifically named cross-flavor parity fixture; it must not conceal a regression in the pinned production contract. Use a ratio rather than an absolute count so the rule scales across export sizes. A material layout or color change still exceeds the pixel-count gate; any intentional change updates an explicitly reviewed baseline.

Keep a small, named Git-tracked fixture suite, not an exhaustive document corpus: retain the prototype composite (linear gradient, shadow, alpha, ellipse clip, crop, rotation, group opacity, vector, wrapped text) and add focused fixtures for every chosen font face/weight/script and anchors; radial and solid fills plus borders; nested z-order and visibility; image `cover`/`contain` and transparent/raster/SVG assets; every element type with transforms; non-square and 2x canvases; and a template exercising defaults, wrap boundary, and each bindable property kind. Missing values/assets and validation failures are functional tests, not goldens. The still-open font decision determines the concrete families and script coverage.

Store the lossless baseline PNG/WebP files alongside visual tests in ordinary Git and commit/review them. Do not introduce LFS until actual size or host limits make it necessary. A baseline is bound to an environment tuple: worker image digest, Playwright package/browser revision, selected headless flavor, font bytes and fontconfig config, viewport/DPR/color scheme/locale/timezone/output scale, plus fixture and compiler/schema versions. Bake and run only in that tuple. Re-bake the whole suite only after a deliberate tuple change (Chromium/Playwright, headless flavor, container/OS libraries, fonts/fontconfig, screenshot config), review the diff, and commit it with old/new tuples; never auto-rebake on failure or from a laptop. Ordinary intended rendering changes update only their affected fixture after review.

## Findings

- Playwright documents pixelmatch as the comparator. `threshold` is a per-pixel perceived YIQ color-distance value in [0,1], default 0.2; `maxDiffPixelRatio` is an independent whole-image ratio and defaults unset. The docs do not explain a rationale for 0.2, so `0.1` is explicit rather than relying on a default. [Playwright PageAssertions API](https://playwright.dev/docs/api/class-pageassertions) and [TestProject API](https://playwright.dev/docs/api/class-testproject).
- The local disposable prototype at commit `17b08b1` used pixelmatch `threshold: 0.1`; its `timings.json` measured 0.534% shell-vs-full differences, while repeat renders of each flavor were byte-identical. That supports 0.006 only for the intentional cross-flavor fixture and strict equality inside the pinned worker contract.
- Playwright states screenshot output varies with OS, version, settings, hardware, power source, and headless mode, and recommends using the same environment for baselines and comparisons. It also documents separate browser/platform snapshots because rendering and fonts differ, and says baselines should be committed and reviewed. [Visual comparisons](https://playwright.dev/docs/test-snapshots).
- Playwright supports lossless WebP baselines and exposes snapshot update as a deliberate action. [Visual comparisons](https://playwright.dev/docs/test-snapshots). Its Docker documentation recommends a version-pinned image and requires the image Playwright version to align with the project. [Docker image tags](https://playwright.dev/docs/docker#image-tags).
- Playwright releases pair with specific browser binaries, so a Playwright/browser update is an input change that can change pixels. [Browser management](https://playwright.dev/docs/browsers). Chrome for Testing is versioned and non-auto-updating for repeatable automation. [Chrome for Testing](https://developer.chrome.com/blog/tools-from-chrome-for-frictionless-testing).
- Skia Gold keeps baselines outside Git and triages results across OS/architecture/backend at very large scale; that solves a multi-configuration fleet problem, not this single pinned-image product. [Skia Gold](https://docs.skia.org/docs/dev/testing/skiagold/). Its first-party diff implementation supports exact count, pixel percentage, channel delta, and combined metrics, but no source establishes an SSIM threshold appropriate to this product. [Skia Gold diff source](https://skia.googlesource.com/buildbot/+/3b616ec50e79/golden/go/diff/diff.go).
- Git LFS stores a pointer in Git and the bytes remotely, adding an availability/tooling dependency; normal Git is therefore the simpler starting point for this deliberately small fixture set. [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage).

## Unresolved

- The exact default font families, weights, and script/glyph cases await node `oxcf2v`; add those to the focused font fixture after that decision.
- No primary source prescribes the 0.6% figure or a universal SSIM limit. The figure is intentionally calibrated to this repository measurement and must be reconsidered only if the defined comparison changes.

## Sources

- Playwright API and visual-snapshot documentation, accessed 2026-08-10.
- Playwright Docker and browser-management documentation, accessed 2026-08-10.
- Chrome for Testing documentation, updated 2024-05-09.
- Skia Gold documentation and first-party source, accessed 2026-08-10.
- GitHub Git LFS documentation, accessed 2026-08-10.
- Local prototype branch `prototype/render-fidelity`, commit `17b08b1`.
