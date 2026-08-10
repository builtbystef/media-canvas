---
id: gqr8bf
title: Does the chosen rendering approach reproduce editor output faithfully and fast enough?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:prototype
depends_on:
    - 53lwlc
parent: v1xa7j
created: 2026-08-08T07:08:55Z
updated: 2026-08-10T03:19:58Z
---

Prototype (prototype skill, disposable code) the two candidates the research on node 7mza2q recommended, against a sample document in the format settled by node 53lwlc.

The research's framing: no engine matches a browser pixel-for-pixel, and none claims to. Parity is bought by running the SAME engine on both sides over the same pinned inputs. Both candidates do that:

A. One Chromium, both sides — the editor renders the document to DOM/SVG in the browser; the worker renders the identical markup in headless Chromium via Playwright (captureScreenshot, printToPDF). Vector PDF with embedded subsetted fonts comes free. Cost: heaviest runtime, and Playwright states rendering varies by host OS, hardware and headless mode, so parity needs a pinned image, fontconfig-pinned fonts, and one fixed choice between chrome --headless and chrome-headless-shell.

B. One resvg, both sides — the document serializes to SVG; the worker rasterizes with resvg; the editor previews through the same resvg compiled to WASM (resvg-js has a WASM backend). resvg is the only project surveyed that claims byte-identical output across platforms, because it uses no system libraries. Cost: PNG only (no PDF backend), no native text rendering, and no first-party Python binding.

Answer: does the exported PNG match what the editor shows for the same document — fonts, text wrapping, image scaling, colors, gradients, drop shadows, clip? What is the per-render time and memory, and does it extrapolate acceptably to a batch of 1,000? Any deal-breakers (font shaping drift, nondeterminism across hosts, crashes under concurrency)? For candidate B specifically: how the MVP's digital RGB PDF export is produced at all, given resvg has no PDF backend.

No project publishes throughput figures, so every number here must be measured, not cited.

Deliverable: a verdict on the rendering approach with the evidence (side-by-side outputs, timings). Feeds the core-area spec (node 6lxoec) and the font contract (node oxcf2v).

## Notes

**claude** — 2026-08-10T03:19:58Z

VERDICT (prototype skill, user decided 2026-08-09): Candidate A — one Chromium on both sides. The editor renders the document's compiled markup in the browser; the worker screenshots the identical markup in headless Chromium via Playwright. Code + evidence (side-by-side PNGs, pixel diffs, timings.json, compare.html, both PDFs): branch prototype/render-fidelity, dir prototype-render-fidelity/ (run: node bench.mjs).

MEASURED EVIDENCE (1080x1080 hard-case doc in the ADR-0001 format: gradient, feDropShadow, ellipse-clipped rotated image with frame/crop, alpha colors, vector star, nested group opacity, wrapped text at two sizes):

- Fidelity: both candidates rendered every feature correctly; zero layout drift in any comparison. All pixel diffs were glyph-edge antialiasing only.
- Chromium headless-shell vs full-Chromium build: 0.534% pixels differ — Chromium does not pixel-match ITSELF across headless flavors. Chromium vs resvg: 0.522%. resvg native vs resvg-WASM: 0 pixels, byte-identical files (its parity claim held exactly).
- Throughput (this host, warm): Chromium 385ms/render sequential, 166ms/render at 8 concurrent pages in one browser → 1,000-asset batch ≈ 2.8 min. resvg: 301ms / 81ms (4 worker threads) → ≈ 1.4 min. Both byte-deterministic across repeat renders same-host; no crashes under concurrency.
- PDF: Chromium printToPDF produced a real vector PDF, selectable text, 632ms, 1.3MB. resvg has no PDF backend; raster PNG-in-PDF via pdf-lib demonstrated (209ms).

WHY A DESPITE B'S PERFECT PARITY: vector PDF export comes free from the same engine; the editor DOM is (nearly) the render markup, so no second live-canvas implementation; 2.8 min per 1,000 is fast enough. Accepted costs, now constraints on the pipeline:
1. Parity is VISUAL, not byte-exact — Chromium varies 0.5% against itself across headless flavors, so it will vary against the user's own browser. Golden-image testing needs a perceptual tolerance, not byte equality (Frontier entry sharpened).
2. The worker must pin: one container image, fontconfig-pinned fonts, and ONE headless flavor (chrome-headless-shell vs chromium new-headless is a real 0.5% fork — the choice goes to the core spec, node 6lxoec).
3. Ops cost: a browser fleet in the worker (page pool in one browser instance was stable at 8 pages).

PATTERN TO KEEP regardless of engine (proven in the prototype): the JSON->SVG compiler computes text line breaks itself (opentype.js advance widths, emitted as fixed tspans), so wrapping can never drift between editor and worker. Feeds the font contract (node oxcf2v): fonts load via @font-face data-URI (browser) — the compiler owns metrics, so the pinned font files ARE the contract.
