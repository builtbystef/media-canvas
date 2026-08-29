---
id: 3qxq9w
title: The keyboard map, duplication, and the clipboard
state: done
assignee: agent
priority: medium
depends_on:
    - 7ih7wa
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-29T07:24:14Z
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

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on ep90f3 (the editor's canvas interactions and tool set): key bindings, modifier keys, the snap threshold, nudge and duplicate offsets, and new-element defaults. Read that note (beaver show ep90f3) before building - do not invent values the decision already fixed.

**agent** — 2026-08-29T07:24:13Z

Implemented the keyboard map, duplication, clipboard, grouping, z-order, select-all, and Escape through the spec's document-operation/store seam.

COMPLETED WORK
- `keyboard-map.ts`: constants bound from ep90f3 (nudge 1 px, Shift 10 px, duplicate +10/+10) and the settled shortcuts. `unwindEscape` peels one layer per press: cancel tool → leave text editing → leave entered group → deselect.
- `arrangement.ts`: duplicate, in-document copy/cut/paste (paste centred at the pointer), group/ungroup, z-order within the current level, select-all ids at that level.
- Store `escape` applies that unwind (and still leaves Crop Mode, which already existed, between text editing and leaving a group). Canvas wires the map, Alt-drag duplicate, and one Undo Entry per completed shortcut.
- AFK seam tests: the worked paste pair, nudge-per-press, duplicate offset, Alt-drag leaving the original, group z-order and geometry, ungroup visual position, z-order at the entered level, select-all, and Escape order. pnpm check and pnpm test (460 TS + 200 Python) pass.

DECISIONS A REVIEWER NEEDS
- Group origin is (0, 0) in the parent, so members keep their authored geometry; ungroup bakes the group's translation (and rotation about the children-bounds centre) so children stay where they looked.
- The clipboard is in-memory, not the system clipboard — "within the open document". Cmd-V with an empty in-app clipboard still falls through to image paste.
- Duplicate copies land at the front of the current level. Z-order moves selected siblings as a block past one unselected neighbour at a time, only at the entered path.
