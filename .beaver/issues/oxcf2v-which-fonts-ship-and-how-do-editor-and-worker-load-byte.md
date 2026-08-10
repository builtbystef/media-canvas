---
id: oxcf2v
title: Which fonts ship, and how do editor and worker load byte-identical font data?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - gqr8bf
parent: v1xa7j
created: 2026-08-08T08:13:50Z
updated: 2026-08-10T18:38:44Z
---

Interview the user (grill-me skill, limited to this question) to settle the font contract.

The research on node 7mza2q made this sharp: fonts are the single largest source of editor-vs-worker divergence, and every candidate pipeline pins them the same way — by refusing system fonts and supplying font bytes explicitly. resvg's byte-identical-across-platforms claim holds only with --skip-system-fonts plus an explicit font directory; Chromium's own web-test harness achieves text determinism by pointing fontconfig at a bundled font set and nothing else; Skia's font fallback for an unmatched character is documented as "the system fallback", which differs per host. Satori goes further and has no system-font access at all: font buffers are mandatory.

Settle: which font families ship with the product by default; whether users can upload their own fonts in the MVP, and in what formats (note WOFF2 is unsupported by satori, and librsvg supports no @font-face at all); how the design document identifies a font (family name, or a content-addressed reference to specific bytes) so that a document rendered a year later picks the same faces; how the browser editor and the worker are guaranteed to load the identical bytes; what happens when a document references a font that is not available (hard error, or documented fallback); and the licensing posture for bundled and uploaded fonts.

Input: the engine verdict from node gqr8bf determines the loading mechanism available (fontdb / FontResolver for resvg, fontconfig + @font-face for Chromium, GlobalFonts for a Skia binding). The answer belongs in the core-area spec (node 6lxoec).

## Notes

**claude** — 2026-08-10T18:38:37Z

FONT CONTRACT (grill session, user decided 2026-08-10):

1. BUNDLED SET — 9 families, all SIL OFL, pinned files (~19): Inter (regular/italic/bold/bold-italic), Montserrat (regular/bold/black), Lora (regular/italic/bold), Playfair Display (regular/bold/black), Oswald (regular/bold), Bebas Neue (regular), Pacifico (regular), Dancing Script (regular/bold), JetBrains Mono (regular/bold). Bundled files are vendored in the repo.

2. UPLOADS — yes in the MVP; TTF and OTF only. WOFF2 is rejected with a convert-first message: the compiler measures text with opentype.js, which cannot parse WOFF2. Variable fonts are rejected at upload (detect the fvar table; message: export static instances) — opentype.js metrics off the default instance are unreliable, which is exactly the editor-vs-worker line-break drift this contract prevents.

3. IDENTIFICATION — content-addressed. One font file = one Font Asset (glossary term added); its id is the hash of its bytes. Text elements reference the asset id; the family name is display metadata for the font picker only. Same id => same bytes by construction; swapping bytes under an id is impossible rather than forbidden. Bold/italic are separate Font Assets, so no synthetic styling ever kicks in.

4. BYTE IDENTITY — editor and worker both fetch the Font Asset by content hash from the app's own storage (FastAPI-served, immutable URL); @font-face src points at that URL; the worker verifies the hash on load. No external font CDN at render time, ever — no Google Fonts links.

5. MISSING FONT ASSET — hard error naming the font id and the elements that reference it; never a fallback face (consistent with node k77nv9: no silent placeholders in generated output).

6. MISSING GLYPH — a character the Font Asset lacks renders the font's own .notdef, identically in editor and worker (both measure and render from the same bytes). No fallback chain in the MVP — it would force per-character font fallback inside the compiler's line-breaking math. Emoji/extended coverage goes to the Frontier.

7. LICENSING — bundled fonts exclusively SIL OFL (redistribution in the container image and PDF embedding/subsetting unambiguously permitted). Uploaded fonts: uploader is responsible for rights; a docs note, no enforcement in the MVP.

Feeds the core-area spec (node 6lxoec).
