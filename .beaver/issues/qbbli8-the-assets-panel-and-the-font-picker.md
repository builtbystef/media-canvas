---
id: qbbli8
title: The Assets panel and the font picker
state: done
assignee: agent
priority: high
depends_on:
    - jr6mye
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-26T10:55:37Z
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

## Notes

**agent** — 2026-08-26T10:55:37Z

Built the Assets panel and the font picker as a client of the existing list/upload/delete endpoints. No server surface changed.

**Seam.** Pure decisions live in `apps/web/lib/assets.ts` (ek7pq1 seam 1 / the web-app module rule on 88v6vg): picker grouping, panel grouping, usage count in the open document, delete-warning copy, and what a picker upload does with the api's own refusal. Components fetch and hand the result on.

**Surfaces.**
- Left-column Assets panel: images as a 2-up thumbnail grid of the full-size serving URLs (browser scales; nothing derived); fonts as rows painted in their own face via `@font-face` against those URLs, under Bundled then Uploaded, bundled rows marked and without delete. Each section has its own upload. Dragging an image writes `IMAGE_ASSET_DRAG_TYPE` (h66j4l already places that payload without uploading).
- Inspector Font field is now the picker: families, bundled first, faces light-to-heavy, each option in its own face. Upload font lives in the picker; a 201/200 selects the new face on the current text element after the bytes are held for the compiler; a 422 (worked example: variable font) renders the refusal message inline and adds nothing.
- Viewer (`mayEdit === false`) sees the library and is offered neither upload nor delete, and cannot drag. Selecting a face still goes through the inspector — that gate was already the inspector's, not this slice's.

**Delete confirm.** Always states that any design or template using the asset will fail to render until it is replaced. If the open document references it, the dialog also says how many elements do. Other documents are not scanned (ADR-0007).

**Reviewer.** Open a template or design in a Workspace that has been seeded (vn4r07). The panel lists bundled faces immediately. Upload a TTF from the picker onto a selected text element to see it apply; a variable font should refuse in the picker's own words. Drag a thumbnail onto the canvas — it places, no second upload. Delete something unused vs something used three times in the open document and compare the two sentences. A Viewer membership should show the library with no upload or trash.

Deleting an in-use asset does not immediately blank the preview: the editor still holds the bytes it already fetched. The missing-asset panel (ljzbq7) is what replaces that preview after a reload.
