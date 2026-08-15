---
id: ljzbq7
title: The missing-asset panel
state: todo
priority: medium
depends_on:
    - n5csrl
    - qbbli8
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-15T07:12:55Z
---

## What to build

What the editor does when an asset a document needs is gone. The compiler cannot produce partial output — without font bytes it cannot measure a line — so there is no version of this where the rest of the canvas draws and one element shows a broken icon. Instead the preview is replaced by a panel that names what is missing and which elements want it, and offers to replace it right there. Without that, a design that references a deleted asset would be permanently unopenable.

## Acceptance criteria

- [ ] A document referencing an asset that cannot be fetched shows a blocking panel in place of the preview, naming each missing asset and listing the elements that reference it by name.
- [ ] Each missing asset offers a replace action that opens the matching picker; choosing a replacement rewrites those references in the document and restores the preview. Worked example: a design with two elements pointing at a deleted image, replaced once, renders immediately and both elements point at the new asset.
- [ ] The replacement is one undo entry, and the next autosave persists it like any other edit.
- [ ] The layer list, the panels and the inspector stay usable while the panel is up, so the replace action is reachable; nothing else draws.
- [ ] Re-uploading the identical bytes of a deleted asset also restores the document, without a replacement, because the asset returns at the same id.
- [ ] The panel appears for a missing font and for a missing image alike, and lists several missing assets at once when there are several.
