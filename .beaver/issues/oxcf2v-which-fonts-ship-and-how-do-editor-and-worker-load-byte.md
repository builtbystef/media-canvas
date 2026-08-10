---
id: oxcf2v
title: Which fonts ship, and how do editor and worker load byte-identical font data?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - gqr8bf
parent: v1xa7j
created: 2026-08-08T08:13:50Z
updated: 2026-08-08T08:13:50Z
---

Interview the user (grill-me skill, limited to this question) to settle the font contract.

The research on node 7mza2q made this sharp: fonts are the single largest source of editor-vs-worker divergence, and every candidate pipeline pins them the same way — by refusing system fonts and supplying font bytes explicitly. resvg's byte-identical-across-platforms claim holds only with --skip-system-fonts plus an explicit font directory; Chromium's own web-test harness achieves text determinism by pointing fontconfig at a bundled font set and nothing else; Skia's font fallback for an unmatched character is documented as "the system fallback", which differs per host. Satori goes further and has no system-font access at all: font buffers are mandatory.

Settle: which font families ship with the product by default; whether users can upload their own fonts in the MVP, and in what formats (note WOFF2 is unsupported by satori, and librsvg supports no @font-face at all); how the design document identifies a font (family name, or a content-addressed reference to specific bytes) so that a document rendered a year later picks the same faces; how the browser editor and the worker are guaranteed to load the identical bytes; what happens when a document references a font that is not available (hard error, or documented fallback); and the licensing posture for bundled and uploaded fonts.

Input: the engine verdict from node gqr8bf determines the loading mechanism available (fontdb / FontResolver for resvg, fontconfig + @font-face for Chromium, GlobalFonts for a Skia binding). The answer belongs in the core-area spec (node 6lxoec).
