---
id: e5zpf3
title: The drawing tools and new-element defaults
state: todo
priority: high
depends_on:
    - 8919ix
parent: ek7pq1
created: 2026-08-15T07:12:30Z
updated: 2026-08-17T04:00:56Z
---

## What to build

Elements can be made, not only moved. Five tools, armed by key or button: select, text, rectangle, ellipse, and hand. A draw tool draws exactly one element and hands control back to select, because a design session is mostly selecting. New elements land with defaults chosen so that a shape drawn without touching the inspector already looks deliberate.

## Acceptance criteria

- [ ] The five tools arm by button and by single-key shortcut; a draw tool creates one element and returns to select; Escape cancels back to select without creating anything.
- [ ] While drawing, one modifier constrains to a square or circle and another draws from the centre; holding space is a momentary hand over whichever tool is active.
- [ ] A rectangle or ellipse drawn by a plain click with no drag is created at a fixed default size at the click point, with the default fill, no border, no shadow, full opacity, no rotation, and no corner radius. Worked example: a click with the rectangle tool creates a 100 by 100 element whose top-left corner is at the click point.
- [ ] A text element created by clicking takes a default wrap width; created by dragging it takes the wrap width from the drag and ignores its height, because height is computed and cannot be stored.
- [ ] A new text element carries the default bundled font, a default size, line height, letter spacing, left alignment, top anchor, and black colour, and opens with its caret active.
- [ ] Images and preset shapes are not tools: they arrive from their panels, which are tracked as their own issues.
- [ ] Creating an element is one undo entry, and the new element is selected when the tool returns to select.

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on ep90f3 (the editor's canvas interactions and tool set): key bindings, modifier keys, the snap threshold, nudge and duplicate offsets, and new-element defaults. Read that note (beaver show ep90f3) before building - do not invent values the decision already fixed.
