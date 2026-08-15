---
id: aij7vj
title: Text editing on the canvas
state: todo
priority: high
depends_on:
    - 8919ix
    - jnih1z
parent: ek7pq1
created: 2026-08-15T07:12:37Z
updated: 2026-08-15T07:12:37Z
---

## What to build

Typing on the canvas, with the compiled markup as the only text renderer. A hidden field holds the raw content, keystrokes go through the document, and what the user sees is always the compiled SVG — there is no second text renderer and no editable HTML, because either one would be a place where the editor and the exported file could disagree. The caret and the selection highlight are drawn from the compiler's own layout, exposed for this purpose rather than reimplemented.

## Acceptance criteria

- [ ] The shared core gains one export that returns the layout of a text element — its lines as ranges over the content, each line's baseline, and the horizontal position of every character boundary — implemented inside the same line-breaking code the compiler uses, never as a parallel implementation.
- [ ] Both directions come from that one export: a position in the content becomes a caret rectangle on the canvas, and a click point becomes a position in the content. Worked example: clicking just past the last character of the first line of a wrapped paragraph places the caret at the end of that line, not at the start of the next.
- [ ] Double-click or Enter on a text element begins editing, with a caret, intra-text selection, the usual word and line navigation, and drag-selection; Escape returns to element selection.
- [ ] The raw content is what is edited, tokens included: a double-brace token is ordinary characters here and displays literally.
- [ ] Enter inserts a hard break, and the compiled text reflows as the content changes.
- [ ] The caret and the selection highlight are drawn in the overlay above the markup, never inside the document.
- [ ] A text element left empty when editing ends is deleted, so no invisible zero-height elements accumulate.
- [ ] One editing session is one undo entry, from entering to leaving, however many keystrokes it contained.
