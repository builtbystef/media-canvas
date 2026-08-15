---
id: aclv2a
title: Compile the canvas, shapes, fills, borders, shadows, and transforms to SVG
state: todo
priority: high
depends_on:
    - 8xstzw
parent: 1qoccb
created: 2026-08-15T05:48:36Z
updated: 2026-08-15T05:48:36Z
---

## What to build

A Design Document made of rectangles, ellipses, and vectors compiles to SVG markup that a browser draws exactly as the document describes — the same string in the editor and in the render worker, so there is nothing for the two to disagree about. This slice also establishes the compiled document itself: the canvas, its background, paint order, and the properties every element shares.

## Acceptance criteria

- [ ] `compile(doc, assets)` returns SVG markup sized to the canvas, painting the canvas background (solid or gradient), with elements drawn in document order — the first element at the bottom.
- [ ] Compilation is deterministic: compiling the same document twice returns the identical string, with no ordering, id, or formatting that varies between runs.
- [ ] A uniform corner radius stays a rect; per-corner radii compile to a path. Worked examples: `cornerRadius: 20` → `<rect ... rx="20">`; `{topLeft: 20, topRight: 0, bottomRight: 0, bottomLeft: 0}` → a `<path>` whose only rounded corner is the top-left one.
- [ ] An ellipse fills its box. A vector scales its path from its own viewBox to the element's width and height. Worked example: a path authored in a 24×24 viewBox on an element 120 wide and 60 high is scaled 5× horizontally and 2.5× vertically.
- [ ] Solid fills, linear gradients, and radial gradients all render. Angle 0 runs a linear gradient left→right and angles increase clockwise. Worked examples: `angle: 0` → left→right; `angle: 90` → top→bottom. A radial gradient is centered in the element's bounding box.
- [ ] A border strokes the edge with the declared color and width, centered on the edge — half inside, half outside.
- [ ] A shadow offsets by `dx`/`dy`, blurs by `blur`, and paints in its color at its opacity, behind the element.
- [ ] Element `opacity` applies to the element as a whole, and `rotation` rotates it clockwise about its own center. Worked example: a 100×50 rect at x 10, y 20 with `rotation: 30` rotates about the point (60, 45).
- [ ] `visible: false` draws nothing for that element, and the element leaves no trace in the markup that could affect anything else.
