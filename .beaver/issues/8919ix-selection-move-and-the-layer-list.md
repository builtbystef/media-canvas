---
id: 8919ix
title: Selection, move, and the layer list
state: done
assignee: agent
priority: high
depends_on:
    - n5csrl
parent: ek7pq1
created: 2026-08-15T07:12:24Z
updated: 2026-08-24T06:56:29Z
---

## What to build

The canvas answers the pointer. Clicking picks the topmost top-level element, double-clicking descends into a group, and Escape climbs back out; a marquee takes everything it touches. Selected elements move by dragging, and the layer list is the same selection seen as a tree — reorder, rename, hide. Every change goes through pure document operations that replace what changed and leave the identity of everything else alone, because the preview's memo caches key on exactly that identity.

## Acceptance criteria

- [ ] Document changes happen only through pure operations that take a document and return a new one, preserving the object identity of every untouched element. Worked example: moving one element in a ten-element document leaves the other nine identical by identity, and the preview patches one node.
- [ ] A click selects the topmost top-level element under the cursor, so clicking a group's child selects the group; double-click enters the group and selects the child, again to descend further, Escape rises one level, and a click outside exits entirely. A modifier-click selects the deepest element without entering.
- [ ] Shift adds to and removes from the selection; a marquee from empty canvas takes every top-level element it intersects, not only those it fully contains, and inside an entered group it is confined to that group's children.
- [ ] A multiple selection shows one axis-aligned union box.
- [ ] Dragging moves every selected element; the pointer offset is preserved, and moving a rotated element does not change its rotation.
- [ ] Selection handles and the union box live in an overlay above the markup, positioned from element bounds, so a fully off-canvas element still shows its handles and can be dragged back.
- [ ] The layer list reorders by drag, renames in place, and toggles visibility by writing the document's own visibility field — the same field a boolean Variable binds to, so hiding here hides in every render.
- [ ] Hit-testing goes through the mounted markup rather than a parallel geometry model, so what the pointer hits is what the eye sees.

## Notes

**agent** — 2026-08-24T06:56:29Z

Implemented the selection and layer-list slice. The agreed AFK test seam was the parent spec's pure document-operation boundary: new Vitest coverage proves structural sharing for a ten-Element move and nested groups, rename/visibility/reorder operations, scope/deep selection, Shift toggling, intersecting marquee selection, and union bounds. The editor now keeps document and selection authority in one Zustand store; hit-tests the mounted compiler markup through elementFromPoint; supports group entry/Escape/deep select, multi-select marquee and drag movement; draws mounted-bounds selection UI in the HTML overlay; and exposes one tree for selecting, reordering, renaming, and changing the Design Document visibility field. Zustand is the production dependency already approved and named by the parent spec. pnpm check, the complete web Vitest suite (46 tests), and pnpm build pass. The repository-wide pnpm test was also attempted, but its unchanged FastAPI suite could not start because the required compose Postgres was not running and this harness denied docker compose up -d; no changed test failed.
