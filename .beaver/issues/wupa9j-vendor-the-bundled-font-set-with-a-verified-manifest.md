---
id: wupa9j
title: Vendor the bundled font set with a verified manifest
state: done
assignee: claude
priority: high
parent: 1qoccb
created: 2026-08-15T05:47:51Z
updated: 2026-08-18T07:53:31Z
---

## What to build

The nine bundled font families ship inside the repository, each file identified by the hash of its bytes, with one manifest that names the family, weight, and style behind each id. Every later piece of work that measures or draws text — the compiler's metrics, the worker's font configuration, the golden fixtures, and (in another spec) per-Workspace seeding — reads that one manifest instead of guessing at file names.

## Acceptance criteria

- [ ] All bundled files are vendored: Inter (regular, italic, bold, bold-italic), Montserrat (regular, bold, black), Lora (regular, italic, bold), Playfair Display (regular, bold, black), Oswald (regular, bold), Bebas Neue (regular), Pacifico (regular), Dancing Script (regular, bold), JetBrains Mono (regular, bold) — 21 files — each accompanied by its SIL OFL license text.
- [ ] A manifest lists every bundled file with its Font Asset id (the hash of its bytes), family name, weight, and style. The family name is display metadata only; the id is the identity.
- [ ] A test recomputes the hash of every vendored file and asserts it equals the manifest id, and that the manifest has no entry without a file and no file without an entry. Worked example: changing one byte of a vendored file, or renaming a family in the manifest, fails this test.
- [ ] A test parses every vendored file with opentype.js and asserts each exposes a `.notdef` glyph, so the missing-glyph rule has something to draw.
- [ ] A test asserts no vendored file carries an `fvar` table (no variable fonts) and that every file is TTF or OTF (no WOFF2) — the two formats the compiler's metrics cannot trust or read.
- [ ] The project docs state the licensing posture: bundled fonts are SIL OFL, and the uploader is responsible for the rights to any font they upload (a note, not an enforced rule).

## Notes

**claude** — 2026-08-18T07:53:31Z

Built packages/fonts (@media-canvas/fonts): 21 vendored static TTFs across the nine SIL OFL families, each family directory carrying its own OFL.txt, plus manifest.json and six tests in src/manifest.test.ts.

Decisions:

- A NEW WORKSPACE PACKAGE, not a directory inside packages/core. The set is data with four consumers — the compiler's metrics (TS), the worker image's fontconfig, the golden fixtures, and FastAPI's per-Workspace seeding (Python, vn4r07) — so it sits beside core rather than inside it. manifest.json is plain JSON precisely so Python reads it with no TS build; src/index.ts is a Node-only convenience wrapper (bundledFonts, bundledFontsDirectory, bundledFontPath). ARCHITECTURE.md gained the module entry.
- IDS ARE SHA-256, FULL LOWERCASE HEX — the layout node 3ko2p7 already decided for asset ids, so the manifest's ids are the ids the api will store.
- SOURCE: Google Fonts' download-list endpoint (https://fonts.google.com/download/list?family={family}), static instances only, kept under their upstream file names. Inter ships its 18pt optical-size cut (Inter_18pt-Regular/-Italic/-Bold/-BoldItalic) — Google publishes no unsuffixed static Inter, only the variable font and the optical-size statics; the manifest's family stays "Inter", which is display metadata anyway.
- THE .NOTDEF ASSERTION is existence at glyph 0 plus an unmapped codepoint resolving to index 0. Pacifico's .notdef is a blank advance rather than a box — that is the font's own answer, deterministic on both sides, and it will appear as blank in the goldens (noted in packages/fonts/README.md so it is not read as a bug later).
- THE FVAR / FORMAT CHECK reads the sfnt header and table directory directly rather than trusting the parser. Verified against real inputs outside the suite: Inter's variable TTF reports fvar, and a Roboto WOFF2 reports the wOF2 version tag; neither would pass.
- opentype.js is a devDependency of this package only (test-only here); it is the parser the spec names, and core takes it as a production dependency when the compiler lands (jnih1z). @types/opentype.js alongside it — the package ships no types.

Facts for a reviewer: the two worked examples were run — flipping one byte of Oswald-Bold.ttf fails the hash test, renaming a family in the manifest fails the roster test; a stray file under files/ fails the pairing test. All 21 files are TTF with no fvar, ~4.3 MB total. Licensing posture is stated in README.md's License section (bundled fonts are SIL OFL 1.1 and are not under the repo's MIT; an uploaded font is the uploader's responsibility, unenforced) and repeated in packages/fonts/README.md. pnpm check, pnpm test and pnpm build all pass; openapi.json is unchanged.
