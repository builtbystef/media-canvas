---
id: qbbli8
title: The Assets panel and the font picker
state: todo
priority: high
depends_on:
    - jr6mye
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-15T07:12:49Z
---

## What to build

Assets become manageable from inside the editor. The Assets panel is the complete surface — images as thumbnails, fonts as rows each rendered in its own face, both with an upload control and a delete action. The font picker carries the same upload as a shortcut, so a font that is missing gets added where the user noticed it was missing, and a rejection appears in that same place, in its own words.

## Acceptance criteria

- [ ] The panel has an images section as a thumbnail grid and a fonts section as rows, each font row rendered in its own face, and each section has its own upload control.
- [ ] Thumbnails point at the full-size asset addresses and let the browser scale them down; no derived or resized files exist anywhere.
- [ ] Bundled fonts appear in the fonts section, grouped together and marked as bundled, with no delete action — hiding them would make the panel disagree with the picker about which fonts exist.
- [ ] The font picker groups faces under their family with bundled families first, and selecting a face applies it to the selected text element.
- [ ] Uploading from inside the picker selects the new face immediately for the current text element; a rejection renders inline in the picker, showing the message that rejection carries rather than a generic failure. Worked example: picking a variable font shows the export-static-instances message inside the picker, and no font is added.
- [ ] Deleting an asset asks first, stating plainly that any design or template using it will fail to render until it is replaced. The dialog counts usages in the open document only — no query, no index, no scan of other documents. Worked example: an image used by three elements in the open design says so; an image used only by another document shows the generic warning.
- [ ] Dragging an asset from the panel onto the canvas places an element without uploading anything.
- [ ] A Viewer sees the panel's contents but is offered neither upload nor delete.
