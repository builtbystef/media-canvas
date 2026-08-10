---
id: ylg1wr
title: Which capabilities make the MVP cut, and in what order do the pillars land?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
parent: v1xa7j
created: 2026-08-08T07:08:28Z
updated: 2026-08-08T07:53:15Z
---

Interview the user (grill-me skill, limited to this question) to cut the MVP from the full vision.

Settle: which asset kinds ship first (Instagram post only? posters? ads?); which editor capabilities the MVP needs (text, images, shapes, layers, alignment — where does it stop?); which export formats first (PNG only?); which generation channels land first (UI one-off vs API vs CLI vs batch upload); and the rough build order of the pillars (editor, design format, rendering pipeline, batch generation).

Context: audience is the user themselves first, product later. Stack fixed as Next.js + FastAPI. See the root issue v1xa7j for the goal and out-of-scope list.

## Notes

**claude** — 2026-08-08T07:53:05Z

ANSWER (settled by interview, user confirmed 2026-08-08):

Asset kinds: arbitrary width x height canvas from day one, plus named Canvas Presets for convenience (Instagram post 1080x1080, Instagram portrait 1080x1350, story 1080x1920). Posters/ads/website graphics are just other dimensions - no per-kind machinery. Reason: arbitrary dimensions cost barely more than hardcoding and make every future asset kind free.

Editor capabilities IN for MVP: text elements (font, size, weight, color, alignment); image elements (upload + place, crop-within-frame, clip-to-shape); rectangles and ellipses; SVG import plus a preset shape library (star, arrow, triangle, line); solid fills and linear/radial gradient fills on shapes and canvas background; borders; drop shadow (offset, blur, color, opacity) on any element; per-element opacity; groups; move/resize/rotate; z-order via layer list; snap guides and alignment tools; undo/redo; canvas background color.

Editor capabilities OUT for MVP: pen tool / Bezier path editing (place existing SVGs instead); element-masks-element masking; inner shadows; background blur; blend modes; gradients on text or borders; multi-page documents; rich text spans (mixed styles in one text box). Reason for the effect/gradient cuts: these are the notorious editor-vs-renderer fidelity traps; reason for pen tool: weeks of editor work that SVG import substitutes for.

Export formats: PNG, JPEG, and digital RGB PDF (design drawn at pixel size - cheap once the raster pipeline works). Print-ready PDF (CMYK, bleed/trim marks) stays on the Frontier. SVG export out for MVP.

Generation channels MVP: one-off from the UI; REST API (single render + batch of rows); CSV/data-file upload in the UI (a thin client over the batch API). CLI comes later (stays on the Frontier).

Build order - walking skeleton spine, not pillar-by-pillar:
1. Design document format + minimal renderer (document -> PNG, hand-written documents, no editor yet)
2. Minimal editor that reads/writes the format, exporting through the same renderer
3. Template promotion + variable slots
4. Batch generation via API + workers (CSV upload UI rides on the batch API)
Reason: de-risks render fidelity before an editor is built around a format the renderer cannot reproduce.

Consequence for dependent nodes: this is a rich editor cut - groups, gradient fills, drop shadows, crop/clip, SVG placement must all be expressible in the design document format (node 53lwlc) and reproducible pixel-for-pixel by the server renderer (nodes 7mza2q, gqr8bf). Those nodes inherit this list as their scope.
