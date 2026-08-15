---
id: oaf94x
title: The golden fixture suite
state: todo
priority: medium
depends_on:
    - 6bqdxe
parent: 1qoccb
created: 2026-08-15T05:49:46Z
updated: 2026-08-15T05:49:46Z
---

## What to build

The named set of fixtures that together exercise everything the renderer can draw, each with a reviewed baseline in the repository. Small enough to read at a glance, wide enough that a regression anywhere in the compiler or the render path lands on at least one of them.

Closure waits for user review.

## Acceptance criteria

- [ ] One fixture per bundled font family, covering that family's weights and styles and a character the font has no glyph for, so a font swap or a metrics change is caught.
- [ ] A fixture covering the vertical anchors crossed with the horizontal alignments, including a wrapped multi-line block in each combination.
- [ ] A fixture covering radial and solid fills together with borders and per-corner corner radii.
- [ ] A fixture covering nested groups: z-order across levels, a hidden child inside a visible group, and a hidden group.
- [ ] A fixture covering `cover`, `contain`, and `stretch` over both a transparent asset and a raster photograph.
- [ ] A fixture on a non-square canvas, and one exported at 2× scale.
- [ ] A Template fixture rendered from a row of values, exercising declared defaults, the wrap boundary from the compile examples, and each bindable property kind: text content, image source, a solid color, a number interpolated into text, and visibility.
- [ ] Every fixture passes at zero differing pixels inside the pinned image, and each baseline is committed alongside its fixture.
