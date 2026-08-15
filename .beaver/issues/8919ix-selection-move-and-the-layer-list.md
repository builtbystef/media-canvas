---
id: 8919ix
title: Selection, move, and the layer list
state: todo
priority: high
depends_on:
    - n5csrl
parent: ek7pq1
created: 2026-08-15T07:12:24Z
updated: 2026-08-15T07:12:24Z
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
