---
id: zycblh
title: Render compiled SVG to PNG, JPEG, and PDF
state: todo
priority: high
depends_on:
    - 6sfpv3
parent: 1qoccb
created: 2026-08-15T05:49:24Z
updated: 2026-08-15T05:49:24Z
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
