---
id: 21plhn
title: 'Font Assets: upload and worker-side inspection'
state: todo
priority: high
depends_on:
    - ilgj60
    - sazdn4
    - 92zwes
    - gxwr7t
parent: ek7pq1
created: 2026-08-15T07:12:07Z
updated: 2026-08-15T07:12:07Z
---

## What to build

A font enters the system. Bytes are hashed, and if that Workspace already holds them the existing asset comes straight back — a re-upload never pays for inspection twice. Otherwise the render worker parses the file with the very parser that will later measure every line of text in it, and only a font that parser accepts is stored. A file that fontTools would take but the render path cannot read is exactly the asset that would hard-error mid-render, so the gate is the render path's own parser.

## Acceptance criteria

- [ ] A Font Asset's identity is its Workspace together with the hash of its bytes; the same file uploaded into two Workspaces is two assets with two stored objects.
- [ ] Uploading bytes already held in that Workspace returns the existing record and creates nothing — not a duplicate, not an error. Worked example: uploading one file twice → the same id both times, one row, and inspection performed once.
- [ ] The worker's internal service gains a font-inspection call, behind the same shared credential as its other internal calls, that parses the bytes with the compiler's own font parser and reports family, subfamily, weight, italic, PostScript name, and whether the file is a variable font.
- [ ] A variable font, a file the parser cannot read, a format other than TTF or OTF, and a file over the size limit are each refused with their own machine-readable code and a message a user can act on. Worked example: a WOFF2 file → refused as an unsupported format with the advice to convert it first, and nothing is stored.
- [ ] A refused font never reaches storage: there is no quarantine area and nothing to sweep later.
- [ ] An accepted font is stored first and its row written second, so a row never points at bytes that are not there.
- [ ] The record carries a flag marking bundled fonts apart from uploaded ones; seeding the bundled families into a Workspace is tracked as its own issue and is not part of this slice.
- [ ] Uploading is Editor-level in the Workspace; a Viewer is refused.
