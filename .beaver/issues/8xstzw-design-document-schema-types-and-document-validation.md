---
id: 8xstzw
title: Design Document schema types and document validation
state: todo
priority: high
parent: 1qoccb
created: 2026-08-15T05:48:05Z
updated: 2026-08-15T05:48:05Z
---

## What to build

One authority decides whether a Design Document is a valid v1 document, so the editor, the render worker, and the API can never disagree about it. A document that misdeclares its schema version, repeats an element id, points a Variable reference at a Variable nobody declared, or carries a malformed color is rejected with errors that name the offending element — not with a stack trace halfway through a render.

## Acceptance criteria

- [ ] The v1 type set is exported from the shared core package: the canvas, Variable declarations, and the six element types (rect, ellipse, vector, image, text, group) with every property the spec names, including fills (solid, linear gradient, radial gradient), borders, shadows, and corner radii.
- [ ] `validateDocument(doc)` accepts unknown input and returns an empty list for a valid document, or a list of errors. Each error carries a message and the id of the element it is about; errors about a Variable name that Variable.
- [ ] `schemaVersion` must be the integer 1. Worked example: a document identical to a valid one but with `schemaVersion: 2` produces exactly one error, naming the version — the compiler accepts no other version, and migrations are out of scope until the first bump.
- [ ] Element ids are unique across the whole tree, groups included. Worked example: a group whose child has id `a`, next to a top-level rect with id `a`, produces one duplicate-id error naming `a`.
- [ ] Every `{$var: name}` reference and every `{{name}}` token inside text content names a declared Variable. Worked example: with only `price` declared, a text element whose content is `Now {{prce}}` produces one error naming `prce` and that element.
- [ ] Colors are `#RRGGBB` or `#RRGGBBAA`. Worked example: `#FFFFFF` and `#ffffff80` are valid; `#fff` and `red` each produce an error naming the element.
- [ ] Numeric ranges are enforced: element opacity and shadow opacity in 0..1, gradient stop offsets in 0..1, widths and heights non-negative. Worked example: `opacity: 1.5` on an element produces one error naming it.
- [ ] A Variable reference appears only where v1 permits one — text content tokens, image source, solid color sites (element fill, border color, text color, canvas background), and visibility. Worked example: `fill: {$var: 'brand'}` on a rect validates; the same reference used as a gradient stop color, as `width`, or as `fontAssetId` produces an error.
- [ ] A document with no `variables` is valid (it is a design, not a Template); a Template's Variable names are unique and each declared `default` matches its declared type.
