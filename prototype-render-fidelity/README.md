# PROTOTYPE — render fidelity bench (disposable, wipe me)

Answers roadmap node `gqr8bf`: does the rendering approach reproduce editor
output faithfully and fast enough? Candidates:

- **A — one Chromium both sides**: editor renders SVG in the browser, worker
  screenshots the identical markup in headless Chromium via Playwright.
- **B — one resvg both sides**: worker rasterizes with native resvg
  (`@resvg/resvg-js`), editor previews through the same resvg compiled to WASM.

Not production code. No tests, no error handling. Delete after the verdict.

## Run

    node bench.mjs

Outputs land in `out/`: PNGs per engine, pixel-diff images, PDFs
(`a-vector.pdf` via Chromium printToPDF, `b-raster.pdf` via pdf-lib PNG
embed), `timings.json`, and `compare.html` — open that file in a browser for
the side-by-side.
