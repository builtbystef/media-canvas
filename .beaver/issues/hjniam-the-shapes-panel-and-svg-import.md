---
id: hjniam
title: The Shapes panel and SVG import
state: done
assignee: agent
priority: medium
depends_on:
    - e5zpf3
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-26T19:34:20Z
---

## What to build

The two ways vector art enters a document. A Shapes panel offers stars, arrows, triangles and lines, dragged onto the canvas like images — they are ordinary vector elements, not element types of their own. And dropping an SVG file imports it as a group of flattened vector elements, or refuses it outright naming what it found, because an SVG carrying text would smuggle a second, unpinned text renderer into every export.

## Acceptance criteria

- [ ] The Shapes panel lists the preset shapes and places one by dragging it onto the canvas, at its natural size, scaled down to fit when the canvas is smaller. A placed preset shape is an ordinary vector element afterwards, indistinguishable from an imported one.
- [ ] Dropping an SVG file places a group centred at the drop point, at the file's natural size, scaled down to fit the canvas when larger.
- [ ] The importer flattens the file into one single-path vector element per path; solid fills carry over, and a uniform stroke becomes the element's border.
- [ ] A file containing text, gradients, patterns, filters, masks or clip paths is refused whole, with a message naming what was found and suggesting the file be flattened or outlined first. Worked example: an SVG with one text node is refused naming text, and nothing is placed — not even the paths it also contained.
- [ ] Dropping a raster file instead runs the image upload path, which is another issue's work, so one drop handler serves both.
- [ ] A placement is one undo entry, and the placed elements are selected afterwards.

## Notes

**agent** — 2026-08-26T19:23:38Z

Seam (AFK, parent spec Testing Decisions #1): the editor's pure document-operation / store surface. Tests cover (1) the shipped Preset Shape list and place-at-natural-size-scaled-to-fit, (2) SVG import flatten/refuse as a pure function on markup, (3) the one drop-source classifier that routes raster files, SVG files, image-asset drags, and preset-shape drags, and (4) one store transition + selection per placement. No new seam: this is the same Vitest surface the drawing-tools and image-placement slices used. UI wiring is glue on top of those functions.

**agent** — 2026-08-26T19:34:20Z

Implemented the Shapes panel and SVG import at the parent spec's document-operation / store seam.

Preset Shapes (star, arrow, triangle, line) ship as ordinary vector Elements — 100×100 (line 100×1), fill #D9D9D9 matching new-shape defaults, line as a stroked path. Drag from the Shapes panel places one at natural size, scaled down to fit a smaller canvas, top-left at the drop (same as Image Assets). After placement nothing marks it as a preset.

SVG drop flattens each path (and rect/circle/ellipse/line/polyline/polygon) into one vector Element, carries solid fills, maps a uniform stroke to border, wraps them in a group centred on the drop at the file viewBox size, scaled down to fit. Text, gradients, patterns, filters, masks, and clip paths refuse the whole file; the message names what was found and tells the user to flatten or outline first. Worked example: a file with one text node is refused naming text and nothing is placed.

One canvas drop handler routes Preset Shape drags, Image Asset drags, raster files (existing upload path), and SVG files. Each placement is one store transition and selects the placed Element (the group, for an import).

pnpm check passes. All 394 TypeScript tests pass. The repository-wide pnpm test was attempted; the unchanged FastAPI suite cannot start because compose Postgres is not reachable at localhost:5432 from this sandbox (unix sockets under .dev/run exist; the api tests do not use them).
