---
id: 3qxq9w
title: The keyboard map, duplication, and the clipboard
state: todo
priority: medium
depends_on:
    - 7ih7wa
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-15T07:12:43Z
---

## What to build

The keyboard, and the operations that only reach the canvas through it: nudging, duplicating, the clipboard, grouping, and z-order. This is where a design session stops being a mouse exercise. Escape is the one key that means the same thing everywhere — unwind exactly one step of whatever state the editor is in.

## Acceptance criteria

- [ ] Arrows nudge the selection by one unit and shifted arrows by ten; each burst of nudges is one undo entry per key press.
- [ ] Duplicating by shortcut offsets the copy slightly; dragging with the duplicate modifier leaves the original in place and moves a copy.
- [ ] Copy, cut and paste work within the open document, with a paste centred at the cursor. Worked example: copying two selected elements and pasting places both, keeping their relative positions, centred where the pointer is.
- [ ] Delete removes the selection in one entry.
- [ ] Grouping wraps the selection in a group in one entry, preserving z-order and each member's geometry; ungrouping unwraps it and leaves the children where they visually were, selected.
- [ ] Z-order shortcuts move the selection forward, backward, to the front, and to the back within its own level.
- [ ] Select-all takes everything at the current level: the top level, or the entered group's children.
- [ ] Escape unwinds one step at a time in order — cancel the active tool, then leave text editing, then leave the entered group, then deselect — rather than jumping to a clean slate.
