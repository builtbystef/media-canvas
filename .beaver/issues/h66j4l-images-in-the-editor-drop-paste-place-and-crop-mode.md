---
id: h66j4l
title: 'Images in the editor: drop, paste, place, and Crop Mode'
state: todo
priority: high
depends_on:
    - 7ih7wa
    - jr6mye
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-15T07:12:43Z
---

## What to build

Images arrive by being dropped, pasted, or dragged in from the panel, and they land as elements straight away — the upload happens then and there, not at save time, with its progress and any rejection shown on the placeholder the user just created. Once placed, double-clicking an image enters crop mode, where the frame and the bitmap inside it move and size independently; outside that mode they always travel together.

## Acceptance criteria

- [ ] Dropping or pasting a raster file uploads it immediately and, on success, creates an image element at the drop point sized from the asset's real dimensions, scaled down to fit the canvas when it is larger.
- [ ] Progress and failure appear on the placeholder itself; a rejected upload removes the placeholder and shows the reason the api gave, in the words that rejection carries.
- [ ] Dragging an existing asset from the Assets panel places an element with no upload at all.
- [ ] Double-clicking an image enters crop mode; Escape leaves it. Inside, dragging a handle moves the frame while the bitmap stays put on the canvas, and dragging inside moves the bitmap under the frame. Worked example: entering crop mode and pulling the right edge inward narrows the frame while the visible part of the photo stays exactly where it was on screen.
- [ ] Outside crop mode the frame and its content change together, so the same part of the bitmap stays framed.
- [ ] Crop mode is the one property edited on the canvas rather than in the inspector; everything else about an image stays inspector-driven.
- [ ] Entering and leaving crop mode is not an undo entry; each crop drag inside it is one.
- [ ] An image element whose asset the document cannot fetch is the missing-asset case, which is tracked as its own issue, not a broken-image icon here.
