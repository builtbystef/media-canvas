---
id: ljzbq7
title: The missing-asset panel
state: done
assignee: agent
priority: medium
depends_on:
    - n5csrl
    - qbbli8
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-29T07:40:22Z
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

## Notes

**agent** — 2026-08-29T07:40:19Z

Built the missing-asset panel. A document that names an asset the library cannot fetch no longer dies behind a blocking sentence: the compiled preview is replaced by a panel, and the layer list, Assets, Shapes, Variables, and the inspector stay up.

**Seam.** Spec seam 1 (document operations / store, Vitest, no browser). Pure decisions live in `apps/web/lib/missing-assets.ts`: `describeMissingAssets` names each missing Font Asset or Image Asset and lists the Elements that reference it (`name`, or `type` when unnamed); `replaceAssetReferences` rewrites every matching `fontAssetId`, image `src`, and Image Variable default in one document value, preserving identity of everything untouched. The store's `commitInspectorEdit` is the Undo Entry. Components fetch, pick, and mount.

**Surfaces.**
- Blocking panel in the preview slot: each missing asset id, the elements that want it, and a Replace that opens the matching picker (the existing font picker; a thumbnail grid for images, with upload). Choosing a replacement rewrites every reference at once and remounts the preview. Worked example: two images pointing at a deleted asset, replaced once, both point at the new one.
- Re-uploading the identical bytes (Assets panel or the picker's upload) puts the asset back in the library at the same id and restores the preview without rewriting the document.
- A Viewer sees what is missing and is not offered Replace.

**Autosave.** Replacement goes through `commitInspectorEdit`, so the existing debounce treats it like any other edit.

**Reviewer.** Open a design, delete an Image Asset it uses, reload: the canvas is the panel, chrome still works. Replace once onto another image — both elements update, undo is one step, the next save persists it. Same for a font. Delete two different assets and see both listed. Re-upload the original file from Assets and the preview returns without a replacement.
