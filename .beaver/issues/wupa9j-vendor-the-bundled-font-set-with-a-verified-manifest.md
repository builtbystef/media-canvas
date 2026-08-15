---
id: wupa9j
title: Vendor the bundled font set with a verified manifest
state: todo
priority: high
parent: 1qoccb
created: 2026-08-15T05:47:51Z
updated: 2026-08-15T05:47:51Z
---

## What to build

The nine bundled font families ship inside the repository, each file identified by the hash of its bytes, with one manifest that names the family, weight, and style behind each id. Every later piece of work that measures or draws text — the compiler's metrics, the worker's font configuration, the golden fixtures, and (in another spec) per-Workspace seeding — reads that one manifest instead of guessing at file names.

## Acceptance criteria

- [ ] All bundled files are vendored: Inter (regular, italic, bold, bold-italic), Montserrat (regular, bold, black), Lora (regular, italic, bold), Playfair Display (regular, bold, black), Oswald (regular, bold), Bebas Neue (regular), Pacifico (regular), Dancing Script (regular, bold), JetBrains Mono (regular, bold) — about 19 files — each accompanied by its SIL OFL license text.
- [ ] A manifest lists every bundled file with its Font Asset id (the hash of its bytes), family name, weight, and style. The family name is display metadata only; the id is the identity.
- [ ] A test recomputes the hash of every vendored file and asserts it equals the manifest id, and that the manifest has no entry without a file and no file without an entry. Worked example: changing one byte of a vendored file, or renaming a family in the manifest, fails this test.
- [ ] A test parses every vendored file with opentype.js and asserts each exposes a `.notdef` glyph, so the missing-glyph rule has something to draw.
- [ ] A test asserts no vendored file carries an `fvar` table (no variable fonts) and that every file is TTF or OTF (no WOFF2) — the two formats the compiler's metrics cannot trust or read.
- [ ] The project docs state the licensing posture: bundled fonts are SIL OFL, and the uploader is responsible for the rights to any font they upload (a note, not an enforced rule).
