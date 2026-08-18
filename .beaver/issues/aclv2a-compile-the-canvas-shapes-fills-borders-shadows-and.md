---
id: aclv2a
title: Compile the canvas, shapes, fills, borders, shadows, and transforms to SVG
state: done
assignee: claude
priority: high
depends_on:
    - 8xstzw
parent: 1qoccb
created: 2026-08-15T05:48:36Z
updated: 2026-08-18T09:09:45Z
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

## Notes

**claude** — 2026-08-18T09:09:45Z

DONE. `compile(doc, assets)` in packages/core/src/compile.ts, with the AssetResolver read contract in packages/core/src/assets.ts, both exported from the package index. Tested at the seam the spec names (seam 1: document in, SVG string out) — 29 tests in compile.test.ts, most asserting the exact compiled string for a small document rather than fragments of it.

Decisions this session made, each of which a later slice inherits:

- DEFINITION IDS DERIVE FROM ELEMENT IDS, never a counter: `fill-<id>` and `shadow-<id>`, with the id escaped injectively (every non-alphanumeric character becomes `_<hex>`), plus `canvas-background` for the canvas. A counter would be deterministic per whole-document compile but would renumber under the per-element patching ADR-0006 requires; ids that come from the element are stable under it.
- NUMBERS reach the markup through one helper that rounds to four decimals, so float arithmetic cannot make two runs disagree over a digit.
- COLORS split into a `#RRGGBB` attribute plus a separate `-opacity` attribute rather than relying on 8-digit hex in SVG attributes, which is what `stop-color` and `flood-color` need anyway.
- LINEAR GRADIENTS use `gradientUnits="userSpaceOnUse"` with the CSS gradient-line construction: the line is centered on the box and long enough that its ends reach the box's outermost corners along the angle. Angle 0 is left→right and angles turn clockwise with y down. The alternative — objectBoundingBox — skews the angle on a non-square element, which "angles increase clockwise" cannot mean.
- RADIAL GRADIENTS take the SVG default (objectBoundingBox, 50%/50%/50%), which is already centered in and sized to the element's box, so they carry no geometry.
- SHADOW `blur` is the CSS and Figma sense — the width of the blurred band — so `stdDeviation` is `blur / 2`. `flood-opacity` is the shadow color's own alpha times its `opacity`. The filter names its region outright in user space (the default crops at 10% of the box and would cut the shadow off), sized for the offset, the blur's reach, and the half of a border that falls outside the edge. `color-interpolation-filters="sRGB"` is set because the linearRGB default would paint the shadow in a color other than the declared one.
- ROTATION, OPACITY, AND SHADOW ride on a `<g>` wrapper, emitted only when at least one of the three is present; geometry stays in canvas coordinates, so rotation is `rotate(a cx cy)` about the element's own center. The wrapper is also what keeps a shadow's filter outside the scale a vector's path carries — measured inside it, blur and offset would be scaled, and unevenly whenever the two scales differ.
- A BORDER ON A VECTOR gets `vector-effect="non-scaling-stroke"`, so "the declared width" stays canvas pixels instead of being multiplied by the path's scale.
- PER-CORNER RADII that overrun their sides shrink by one shared factor (the CSS border-radius rule), so a corner keeps its share of the side it competes for. The rect/path split is decided by the value's shape, not by whether the four numbers happen to be equal: the object form always compiles to a path.
- AN UNRESOLVED VarRef THROWS, naming the Variable. The document types permit one everywhere `resolve` fills in, so the compiler must do something; painting a guessed value would let a pipeline mistake reach a rendered asset. Preview values for Variables that have neither a value nor a default belong to `resolve` (d2v61j), not here.

Facts a reviewer needs:

- `compile` refuses image, text, and group with "not implemented yet" — placeholders for r0w3w6, jnih1z, and f2hjkt. `AssetResolver` is defined in full per the spec's seam signature, but no element type in this slice consults it; the tests' resolver throws on every call, which is what proves it.
- Memoization is not built here. ADR-0006's two caches are an acceptance criterion of n5csrl, and nothing in this slice's structure blocks them: per-element markup is emitted by one function and does not depend on the element's position in the document.
- No new dependency.
