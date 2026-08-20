---
id: n5csrl
title: 'The canvas: compiled preview, memoized patching, and zoom'
state: done
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
updated: 2026-08-20T09:13:58Z
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

## Notes

**claude** — 2026-08-19T12:16:02Z

Built 2026-08-19. The canvas draws the compiler's own markup, mounted once and patched per element thereafter; it zooms, pans, and remembers where it was left.

**Where the work lives.** The preview's decisions are in `packages/core` (`src/preview.ts`, plus the caches inside `src/compile.ts`), per kjgubg's rule that the editor's canvas logic belongs to the core and is tested there. `apps/web` holds what only a browser can do: fetching the assets, putting the core's answer into the DOM (`mounted-preview.ts`), and the view (`lib/canvas-view.ts`, `lib/canvas-assets.ts`). 30 new tests: 16 in core (preview + element identity + referencedAssets), 15 in web (view arithmetic and persistence, the resolver and missing assets). `pnpm run ci` green; 200 TS tests.

**Decisions taken while building.**

1. *An element names itself in the markup.* The compiler now writes `data-element="{id}"` on the one node that is an element's own — the group it already needed, or its shape. A text element and a bordered image draw as several nodes, so they are gathered into a `<g>` that carries the name. This is the shared compiler's output, so the worker renders it too: attributes move no pixel, and the alternative (the editor finding nodes by index) would have been a second model of the markup to keep in step. 8919ix's hit-testing walks up to the same attribute, as the spec says.
2. *A patch carries its element's definitions.* A gradient, a shadow filter and an image's clip live in `<defs>`, keyed off the element id. Replacing only the element's node would leave a stale gradient behind, so `ElementPatch` carries the definitions the element owns now and the ids it no longer owns; `<defs>` entries are tracked by id through the compile rather than matched by name in the DOM.
3. *What a patch cannot express is a full compile*, and the honest list is: the canvas or schema version changed; elements were added, removed, reordered or retyped; an element stopped drawing or started; or the set of Font Assets changed (the inlined faces are one block the whole document shares). Inside a *rotated* group a child's change moves the group's own centre, so there the group's node is what is patched — the descent into a group happens only while the group draws itself the same way whatever its children do.
4. *Three caches, not two.* The two ADR-0006 asks for (line breaking, emitted markup, both WeakMaps on element identity), plus the `<style>` block keyed on the set of Font Assets, plus each face parsed once per Font Asset id. The last two are what keep a full recompile off the base64.

**Measurements** (this machine, node, the prototype's document shapes at 1080x1080, Inter regular + bold inlined; `node packages/core/bench/preview-budget.ts`):

    top-level/total/text | svg    | open   | rebuild | dirty | gesture p50/p95
    15 / 26 / 9          | 902 KB |  85.7  |  3.5    | 0.5   | 0.037 / 0.061
    30 / 56 / 19         | 910 KB |  81.6  |  6.2    | 0.5   | 0.030 / 0.055
    48 / 92 / 31         | 919 KB |  63.7  |  7.7    | 0.5   | 0.019 / 0.028
    60 / 116 / 39        | 926 KB |  70.6  |  7.7    | 0.5   | 0.025 / 0.047
    120 / 236 / 79       | 958 KB |  76.4  | 19.4    | 0.6   | 0.034 / 0.064

`gesture` is one element changed and patched: 0.02-0.07 ms, two orders under the millisecond budget, and flat in document size as the prototype found. `rebuild` is a full compile with every element new and the fonts already held — 3.5 to 19.4 ms, the tens of milliseconds ADR-0006 accepts, fonts inlined and all. `dirty` is a full compile where the elements are the objects they were. `open` is the first compile of a session, and the number worth a reviewer's attention: 60-90 ms, of which ~40-50 ms per face is opentype.js parsing and base64-inlining the bytes, paid once per Font Asset and never again — it is why the face block is its own memo entry. It lands beside the network fetch of those same bytes, at document open.

**Facts a reviewer needs.**

- The Workspace the asset URLs are built from is the one the shell's switcher is on, exactly as hg52gb's rename gate does, because `DocumentView` still does not name its own Workspace. mg5asi tracks that; a document deep-linked from another Workspace shows the missing-asset message rather than drawing.
- A missing asset gets one blocking sentence naming the ids. The panel that names the elements and offers Replace is ljzbq7, unchanged.
- Bindings implemented: scroll pans, Shift-scroll pans horizontally (both the stage's own scrolling), Cmd/Ctrl-scroll and trackpad pinch zoom at the cursor, Space-drag and middle-drag pan. Cmd-0 / Cmd-1 / Cmd-2 are keyboard-map work and stay with 3qxq9w; Cmd-2 needs a selection, which is 8919ix.
- A Template whose Variables are bound cannot be compiled — the compiler refuses an unresolved reference, and preview-with-defaults is 0y2iw3's criterion. No document has Variables yet; opening one would show the blocking sentence rather than a half-drawn canvas.
- Clipping is the `<svg>` viewport's own: no pasteboard, no second surface (ADR-0008).
- Nothing was seen in a browser during this session — this sandbox has neither the compose stack nor a browser binary. The DOM glue (`mounted-preview.ts`: XML-parsed nodes, node replacement, `<defs>` upkeep) is the part that has run nowhere yet; vmz1ew is where a browser will exercise it.

**What you must do.** This slice's closure waits on your review, because the preview's fidelity is judged by eye: open a design, check that it is the document and not an approximation, zoom in and out at the cursor, pan, reload and find the view where you left it, and drag an element past the canvas edge to see it clipped rather than parked. Close this issue to approve it (8919ix and ljzbq7 unblock when you do), or write a note with what you want changed and remove the `needs-review` label.

**claude** — 2026-08-20T09:13:58Z

Reviewed in a browser by the user on 2026-08-20 and approved. Every check ran against a seeded document (gradient, shadowed card, ellipse-clipped image, text, rotated group, one element hanging over the corner): fidelity by eye, zoom at the cursor to both ends of the 5-1600 range, the four pan bindings, the SVG subtree untouched across zoom, view restored on reload, clipping at the canvas edge, and the blocking sentence when the Image Asset was deleted. Patching still has no UI path; its evidence stays the core tests and the bench.
