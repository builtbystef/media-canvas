---
id: oaf94x
title: The golden fixture suite
state: in-progress
priority: medium
labels:
    - needs-review
depends_on:
    - 6bqdxe
parent: 1qoccb
created: 2026-08-15T05:49:46Z
updated: 2026-08-26T16:23:51Z
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

## Notes

**agent** — 2026-08-26T15:42:37Z

Seams (AFK): spec seam 3 — render, inside the pinned image. The existing golden check already walks workerGoldens at ratio 0, so this slice adds the named fixtures to that list. Host-testable: each fixture is a valid Design Document, compiles, and structurally covers its criterion (families/faces/.notdef, anchors×alignments with wrap, fills/borders/radii, nested visibility, fit modes × assets, non-square + 2× scale, Template defaults and bindable kinds). Missing values/assets stay at seams 1–2.

**agent** — 2026-08-26T16:10:55Z

Built the named fixture suite. Closure waits for user review.

What landed
- workerGoldens is now composite + 9 font-family fixtures + anchors, fills, groups, fit-modes, nonsquare, scale-2x, template. The in-image check already walks that list at ratio 0.
- Font fixtures are generated from the bundled manifest (one per family, every weight/style, plus ☃ as the project's established missing glyph).
- GoldenFixture.scale + fixtureRenderOptions: bake and the golden check render scale-2x at deviceScaleFactor 2; everyone else stays 1×.
- Host tests lock the structural coverage. All 24 goldens unit tests pass. Worker tsc is clean.

Decisions
- Fit-mode frames omit authored crop so compile places by fitMode (the seam on 1qoccb). The Template image keeps a crop; resolve drops it because src is a VarRef.
- Hidden child is a direct child of the visible outer group so z-order across levels stays readable (back in a nested group, mid in the parent, front as a later sibling).
- The wrap boundary is both compile-example widths (LIMITED OFFER at 290 and 120) on the Template fixture; the anchors grid uses the wrapping 120.

Not done in this session — needs the reviewer
- Docker is denied here, so goldens:bake was not run and the new baselines are not committed. image:check will fail each new name until someone bakes inside the pinned image and commits the PNGs. Bake rewrites every worker-output baseline; composite should be unchanged.
- Close this issue to approve (after the PNGs are in), or note requested changes and remove needs-review.

**agent** — 2026-08-26T16:23:51Z

Bake ran inside the pinned image. composite.png is byte-identical to the committed baseline. 16 new PNGs written: 9 font families (faces + .notdef), anchors 3×3 wrap, fills, groups (no hidden green/yellow), fit-modes (cover/contain/stretch × transparent and photo), nonsquare 640×360, scale-2x at 480×240, template row (defaults, wrap 290/120, all bindable kinds). Pictures look correct. Close to approve, or note requested changes and remove needs-review.
