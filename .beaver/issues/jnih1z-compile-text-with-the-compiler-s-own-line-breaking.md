---
id: jnih1z
title: Compile text with the compiler's own line breaking
state: done
assignee: claude
priority: high
depends_on:
    - aclv2a
    - wupa9j
parent: 1qoccb
created: 2026-08-15T05:48:53Z
updated: 2026-08-18T23:54:43Z
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

**claude** — 2026-08-18T23:54:43Z

DONE. Text compiles in packages/core: the layout (line breaking, alignment, anchoring, baselines) is a new module, src/text.ts; the emission (@font-face, <text>/<tspan>, .notdef paths) is in src/compile.ts. 21 new tests in compile.test.ts, at the seam the spec names (document in, SVG string out), measured against the real bundled font files rather than a stand-in.

Decisions this session made:

- THE WORKED EXAMPLES ARE MEASURED AGAINST OSWALD BOLD. "The bundled bold font" is not named in the spec, and only one bundled bold face makes both worked examples true: at fontSize 30, `LIMITED` measures 96.81 in Oswald Bold and fits a 120-wide line, while Inter Bold (120.72), Montserrat Bold (129.9), Lora (131.49), Playfair Display (131.04), Dancing Script (124.11) and JetBrains Mono (126) all overrun it and would break mid-word instead of at the space. `LIMITED OFFER` is 179.52, so the 290 case is one line either way. The tests state the font they measure.

- MISSING GLYPHS ARE EMITTED AS THE FONT'S OWN .notdef OUTLINE, as a <path> beside the <text>. Left in the text, a browser answers a missing glyph with a fallback face — desktop Chrome in the editor has the whole system to fall back to, the worker image has only the app's fonts — so the two sides would draw different things, which is exactly what the criterion forbids. A line is split into pieces where coverage changes; a line with full coverage stays one tspan. A font whose .notdef is blank (Pacifico) emits nothing, which is that font's own answer.

- LETTER SPACING GOES IN THE GAPS, opentype's goes after every glyph. `forEachGlyph` is called with `letterSpacing: px / fontSize` and the one trailing gap is subtracted, so a run of n glyphs carries n−1 gaps. Between two pieces of a split line the compiler adds one gap itself, so a line measures the same however coverage splits it. Each line is written at a computed x with the default `text-anchor`, so the browser's own trailing-gap behaviour cannot move a glyph.

- WHITESPACE. `\r\n`/`\r` normalize to `\n` and a hard break; a tab normalizes to a space, because SVG's whitespace handling turns it into one anyway and most fonts have no tab glyph (it would otherwise measure and draw as .notdef). The plain space is then the only break opportunity, so a non-breaking space does not break. `xml:space="preserve"` keeps the runs of spaces the compiler measured. Whitespace travels with the word that follows it, so a break consumes its spaces and the spaces inside a line stay; a paragraph's own leading indentation is kept. An empty paragraph draws nothing and still takes its line box.

- FONT FACES ARE EMITTED ONLY FOR FONT ASSETS SOMETHING DRAWN ASKS FOR, but every Font Asset the document references — invisible elements and group children included — is loaded before anything is drawn, so a resolver failure is reported once, naming the id and every element that wanted it, rather than at the first element that happens to be visible. An invisible text element therefore does not drag a megabyte of base64 into the markup. The family name is `font-<escaped asset id>`, never the family name inside the file, so two assets cannot collide and no font metadata can be picked up by accident. No font-weight or font-style is declared or requested, so nothing synthesizes a bold or an italic.

- A TEXT SHADOW'S FILTER REGION IS MEASURED ON THE GLYPHS, not on the line boxes: with the stated half-leading convention the ascent and descent of a face like Oswald (1193/−289 per em) reach past a line box at lineHeight 1, and the region would have cut the shadow off the descenders. `wrap` gained an optional ink box for this; rotation still turns about the block box's centre, which is the box the editor shows.

Facts a reviewer needs:

- opentype.js became a production dependency of packages/core, as the spec's Dependencies section provides for. @types/opentype.js and @media-canvas/fonts are devDependencies (tests only).
- packages/fonts gained `bundledFontBytes(font)`. The core's tests need a Font Asset's bytes, and core must stay free of Node types — a browser package that typechecks against node:fs is a guard worth keeping — so the read stays in the package that already does file reads.
- CUTTING AT THE CANVAS EDGE needed no code: the outermost <svg> clips its viewport, and both sides mount the same markup. The test pins that the compiler neither drops a line nor moves one, and adds no `overflow` that would open the viewport up.
- Line breaking re-measures the candidate line per word (and per character when a word is broken). Correct, but quadratic in a line's length; ADR-0006's memoization is an acceptance criterion of n5csrl and nothing here blocks it — layout is one pure function of the element and its font.
- Not built here, and left as it was: `compile` still refuses image and group with "not implemented yet" (r0w3w6, f2hjkt).
- pnpm check, pnpm test (92 TS + 64 Python) and pnpm build all pass; openapi.json is unchanged.
