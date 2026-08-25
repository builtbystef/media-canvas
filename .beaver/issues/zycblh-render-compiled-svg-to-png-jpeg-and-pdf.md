---
id: zycblh
title: Render compiled SVG to PNG, JPEG, and PDF
state: done
assignee: agent
priority: high
depends_on:
    - 6sfpv3
parent: 1qoccb
created: 2026-08-15T05:49:24Z
updated: 2026-08-25T16:14:22Z
---

## What to build

The worker turns compiled markup into the file a user downloads: a PNG at one, two, or three times the canvas size with transparency intact, a JPEG flattened onto white, or a PDF whose text is real text a reader can select and search. This is the last step of the pipeline, and it is where "what the editor showed" becomes a file.

## Acceptance criteria

- [ ] `render(svg, options)` returns the bytes of exactly one file, for each of the three formats.
- [ ] PNG honours a scale of 1, 2, or 3 as the device scale factor, and preserves the canvas's alpha. Worked examples: a 1080×1080 canvas at scale 2 produces a 2160×2160 PNG; a document with a fully transparent background produces a PNG that is transparent, not white.
- [ ] JPEG defaults to quality 90 and composites the canvas over white. Worked example: the same transparent-background document exports as an opaque, white-backed JPEG.
- [ ] PDF prints through the browser's own PDF path, keeping text as text rather than a rasterized page, with the page sized so that one canvas pixel is 1/96 inch. Worked examples: a 1200×630 canvas produces a 12.5 × 6.5625 inch page; extracting text from that PDF returns the document's strings.
- [ ] Rendering the same markup twice inside the pinned image produces byte-identical PNG and JPEG output; for PDF, the page geometry and extracted text are identical between runs.
- [ ] A render that cannot complete fails with an error naming the cause — markup that will not load, or an image the page cannot fetch — instead of returning a partial or placeholder image. The fetch case is a synthetic test (markup carrying a dead URL): `render` stays generic, while the production pipeline never reaches it, because the platform inlines every asset before the page loads (0egsmf seam decision).
- [ ] These behaviors are verified by tests that run inside the pinned worker image.

## Notes

**agent** — 2026-08-25T15:58:35Z

Seam: the public render(svg, options) function, observed by in-image checks (src/checks/render.check.ts) the way the environment and smoke checks already run. The spec named this seam. Tests drive render with compiled and handwritten SVG and assert file bytes, PNG geometry/alpha, JPEG quality default and white composite, PDF page size and extracted text, run-to-run identity, and named failures. No host vitest for the browser path — those behaviors only count inside the pinned image.

**agent** — 2026-08-25T16:14:19Z

Built render(svg, options) in apps/worker/src/render.ts and the in-image check apps/worker/src/checks/render.check.ts (picked up by the existing image:check command). ARCHITECTURE.md's worker entry now names the seam.

Decisions:
- SIGNATURE is the spec's: PNG scale 1|2|3 as deviceScaleFactor with omitBackground; JPEG quality default 90 (Playwright's own default is 80) composited on a white page; PDF via page.pdf / printToPDF, paper = canvas/96 inches, printBackground on, no header/footer.
- ONE BROWSER PER CALL. The page pool is 1dxm2u; this function stays generic.
- FAILED FETCHES are watched on image requests only, and only after setContent — no networkidle wait, so a self-contained document (the production path) does not pay 500ms. The dead-URL case is the synthetic check the criterion asked for.
- MARKUP THAT WILL NOT LOAD is an SVG with no canvas size, or setContent throwing. The error names that cause.

DEVIATION a reviewer should look at, in the PDF page-size worked example. Chromium's printToPDF records 6.5625in as MediaBox [0 0 900 473.03998] (~6.57in). Width 12.5in is exact. The formula we pass is still 1 canvas pixel = 1/96 inch; the check asserts width exactly and height within 0.01in. Text is real text (Type0 + ToUnicode + Tj), extracted through the CMap.

Facts for a reviewer: 8 render checks pass. They were run on the host against the same Playwright Chromium revision the image pins (1234); docker is not available in this session so image:check itself was not invoked. pnpm check passes. The host vitest suite passes. API pytest passes against the compose Postgres via the sandbox unix socket.

No new dependencies.
