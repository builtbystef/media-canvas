---
id: e5zpf3
title: The drawing tools and new-element defaults
state: done
assignee: agent
priority: high
depends_on:
    - 8919ix
parent: ek7pq1
created: 2026-08-15T07:12:30Z
updated: 2026-08-24T07:06:44Z
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

**agent** — 2026-08-24T07:06:44Z

Implemented the five-tool drawing slice at the parent spec's pure operation/store seam. Select, Text, Rectangle, Ellipse, and Hand arm by button or V/T/R/O/H; Escape cancels a tool, Shift constrains shapes, Alt draws from centre, and held Space momentarily pans without changing the armed tool. Rectangle and ellipse creation uses the settled 100x100 click and #D9D9D9 defaults; text uses 300px click width or drag width, Inter Regular, 48px/1.2/0 typography, left/top/black defaults, and enters focused text-editing state. Creation is one atomic document transition, returns to Select, and selects the new Element. The default font is prefetched before drawing. The AFK seam tests cover key mapping, modifier geometry, exact shape/text defaults, one creation transition, selection, and text editing activation. pnpm check, all 52 web tests, and pnpm build pass. The repository-wide pnpm test was attempted; its unchanged FastAPI suite could not start because compose Postgres was not running and this harness denied docker compose up -d.
