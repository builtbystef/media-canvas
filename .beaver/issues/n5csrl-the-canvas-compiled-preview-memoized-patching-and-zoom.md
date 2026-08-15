---
id: n5csrl
title: 'The canvas: compiled preview, memoized patching, and zoom'
state: todo
priority: high
depends_on:
    - hg52gb
    - jr6mye
    - aclv2a
    - jnih1z
    - r0w3w6
    - f2hjkt
parent: ek7pq1
created: 2026-08-15T07:12:18Z
updated: 2026-08-15T07:12:18Z
---

## What to build

The editor's canvas is the compiled document itself — the same markup the render worker will produce, from the same compiler, mounted once and thereafter patched in place. This is the invariant the whole product rests on: anything the editor can show that the compiler cannot express is a bug. Nothing is editable yet; what this slice delivers is a document that opens, renders exactly as it will export, and zooms and pans at full frame rate.

closure waits for user review

## Acceptance criteria

- [ ] Opening a document compiles it through the shared core and mounts the result in a container React never reconciles; every later change reaches that container imperatively, never through rendering.
- [ ] Every asset the document references is fetched before the first compile, because the compiler asks for font bytes and image sizes synchronously. An asset that cannot be fetched does not produce a half-drawn canvas — the failure is surfaced, and the panel that handles it is tracked as its own issue.
- [ ] Compilation memoizes per element on object identity, in one cache for line breaking and one for emitted markup, so an unchanged element is never recompiled.
- [ ] The block of inlined font faces is its own memo entry, keyed on the set of Font Assets the document uses: a full recompile re-emits it only when that set changes, and a per-element patch never touches it.
- [ ] Changing one element patches only that element's node in the mounted markup, and a change that dirties the whole document does one full compile. Both are measured at the document sizes the preview prototype used, and the measurements are recorded: a gesture frame stays under a millisecond and a full compile stays in the tens of milliseconds, fonts inlined and all.
- [ ] Zoom is a transform on a wrapper around the markup, never a recompile at another scale, so the memo caches survive every zoom change. Range five percent to sixteen hundred; scroll and pinch bindings as the interaction model settles them.
- [ ] Zoom and scroll position persist per document in the browser and nowhere near the document itself; a document opened for the first time lands zoomed to fit.
- [ ] Elements outside the canvas are clipped exactly as they are in an exported file: no pasteboard, no dimmed overflow, no second drawing surface.
