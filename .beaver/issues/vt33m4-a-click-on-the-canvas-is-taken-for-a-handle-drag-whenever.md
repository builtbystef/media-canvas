---
id: vt33m4
title: A click on the canvas is taken for a handle drag whenever anything is selected
state: todo
priority: high
labels:
    - bug
parent: ek7pq1
created: 2026-08-24T10:22:21Z
updated: 2026-08-24T10:22:21Z
---

## What is wrong

In the editor's pointer-down, the guard that decides whether a press began on a
resize handle reads:

```ts
const handleNode = (event.target as globalThis.Element).closest?.("[data-handle]");
const handle = handleNode?.getAttribute("data-handle") as Handle | null;
if (handle !== null && selectionBox !== null && selected.length > 0) {
```

When the press did not land on a handle, `closest` answers `null`, the optional
chain makes `handle` **`undefined`**, and `undefined !== null` is true. So the
branch runs for every left press on the stage, stores a `handle` gesture whose
handle is `undefined`, and returns before the selection code below it.

The cast is what hides it: `as Handle | null` tells the typechecker the value
cannot be `undefined`, so the comparison looks exhaustive and lint stays quiet.

## What it costs

Once one Element is selected, the selection can no longer be changed with the
pointer:

- Pressing empty canvas does not clear the selection (`select([], [])` at the
  bottom of the handler is unreachable).
- Pressing a different Element does not select it.
- Marquee cannot be started while anything is selected.

Confirmed in a browser against the dev server on 2026-08-24: after drawing one
rect, every subsequent press on the stage left the inspector on the same
Element.

## Where it came from

Not from the styling work (hq3p33). The two lines are byte-identical in
`745cab2`, the commit before it; hq3p33 only changed the selector string from
`".selection-handle"` to `"[data-handle]"`. It dates from the resize/scale
handle slice (7ih7wa) and has been latent since — the editor had not been run
against a live stack until now.

## Acceptance criteria

- [ ] With one Element selected, pressing empty canvas inside the Canvas clears the selection and begins a marquee.
- [ ] With one Element selected, pressing a different Element selects that one instead.
- [ ] Pressing an actual resize handle still begins a handle drag, and rotation zones still begin a rotate.
- [ ] The guard cannot silently regress: the handle is `null` rather than `undefined` when no handle was pressed, and the cast no longer claims otherwise.
- [ ] A test at the seam covers "press with a selection, not on a handle" so the branch order is pinned.
