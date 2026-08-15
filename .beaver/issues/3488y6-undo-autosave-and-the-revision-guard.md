---
id: 3488y6
title: Undo, autosave, and the revision guard
state: todo
priority: high
depends_on:
    - qqzqhz
    - 8919ix
parent: ek7pq1
created: 2026-08-15T07:12:24Z
updated: 2026-08-15T07:12:30Z
---

## What to build

Work is not lost and not clobbered. Every completed gesture is one undo step — a drag is one entry, not one per frame — and undoing shows what changed by restoring the selection that entry touched. Meanwhile the document saves itself a second after the last change, tells the user where it stands, retries quietly when the network is unhappy, and stops dead if the document changed somewhere else.

## Acceptance criteria

- [ ] Undo and redo move a pointer over snapshots of the document; a new edit clears the redo side; the stack lives in memory only and holds at most two hundred entries.
- [ ] One completed gesture is one entry. Worked examples: a drag lasting a hundred and twenty frames is one entry; moving three elements at once is one entry, not three; a slider drag in the inspector commits one entry on release; a typed field commits one entry on blur or Enter.
- [ ] Selection changes are never entries, but undoing an entry restores the selection to the elements it touched. Worked example: undoing a two-element move restores both positions and selects exactly those two.
- [ ] The document autosaves about a second after the last change, flushes immediately when the tab is hidden or closed, offers a flush-now shortcut, and shows a saving or saved indicator throughout.
- [ ] A save that fails for any reason other than a conflict never interrupts editing: it retries with a widening delay up to a cap, and the indicator warns until a save lands.
- [ ] A conflicting save shows a blocking notice that the document changed elsewhere and must be reloaded. Nothing is merged, and no further save overwrites it.
- [ ] A document whose schema version is not the one the core understands is refused at load with a named error rather than opened and re-saved. Migration is where the core spec puts it, and there is nothing to migrate until the schema first moves.
