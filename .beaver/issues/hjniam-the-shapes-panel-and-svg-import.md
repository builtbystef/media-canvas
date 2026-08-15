---
id: hjniam
title: The Shapes panel and SVG import
state: todo
priority: medium
depends_on:
    - e5zpf3
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-15T07:12:43Z
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
