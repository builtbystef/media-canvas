---
id: jnih1z
title: Compile text with the compiler's own line breaking
state: todo
priority: high
depends_on:
    - aclv2a
    - wupa9j
parent: 1qoccb
created: 2026-08-15T05:48:53Z
updated: 2026-08-17T04:00:39Z
---

## What to build

Text elements compile to SVG whose line breaks the compiler computed itself and wrote down, so no browser is ever free to rewrap a line and make the editor and the export disagree. The compiled markup carries the font bytes inside it, which means the same string draws the same glyphs wherever it is opened, with no font setup on the host and no request to any font service.

## Acceptance criteria

- [ ] Lines break greedily at whitespace, measured with opentype.js advance widths with kerning on and `letterSpacing` added at each gap between glyphs. Each line is emitted at a fixed position, so the rendering browser performs no wrapping of its own.
- [ ] Worked example (wrap): the content `LIMITED OFFER` in the bundled bold font at `fontSize: 30` with `width: 290` compiles to exactly one line; the same content at `width: 120` compiles to two lines, broken at the space.
- [ ] A single word wider than the wrap width breaks mid-word, at character granularity.
- [ ] `lineHeight` multiplies `fontSize` to give the line advance; `align` places each line left, centered, or right within the wrap width; `anchor` grows the block downward, both ways, or upward from the element's y.
- [ ] Worked example (anchor): three lines at `fontSize: 30` and `lineHeight: 1.2` (36 px per line) with `anchor: 'middle'` at `y: 400` produce a block vertically centered on 400, with the first baseline above 400.
- [ ] The vertical convention is CSS-like half-leading: each line box is `fontSize × lineHeight` tall, and within a line box the baseline sits at `(fontSize × lineHeight − fontSize) / 2 + ascent` from the box's top, with the ascent read from the font's own metrics scaled to `fontSize`. With `anchor: 'top'`, the top of the first line box is the element's y; the other anchors shift that same block whole. The goldens freeze this convention, so it is stated here rather than left to the implementer.
- [ ] Text growing past the canvas edge is cut at the canvas edge — the editor preview and the exported file cut it identically.
- [ ] The compiled markup is self-contained for fonts: for each Font Asset the document uses, the compiler emits an `@font-face` rule whose source is that asset's bytes inline, taken from the asset resolver it already reads metrics from. The markup makes no request to any external font host, and needs no font wiring from whatever loads it.
- [ ] A character the Font Asset has no glyph for renders that font's own `.notdef`. No other face is ever substituted, in either the editor or the worker.
- [ ] A `fontAssetId` the resolver cannot supply fails compilation with an error naming the font asset id and the elements referencing it — never a fallback face and never a silent skip.
- [ ] Text color and text shadow render. Worked example: a resolved element whose content is `Price: 4.99` emits exactly that text — substitution already happened during resolution, and the compiler performs none.

## Notes

**claude** — 2026-08-17T04:00:39Z

Decision: the vertical text convention is pinned in the acceptance criteria (half-leading baseline placement; anchor top puts the top of the first line box at the element's y), so the goldens freeze a stated rule rather than an implementer's choice.
