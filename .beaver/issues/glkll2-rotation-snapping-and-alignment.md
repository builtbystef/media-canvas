---
id: glkll2
title: Rotation, snapping, and alignment
state: in-progress
priority: high
labels:
    - needs-review
depends_on:
    - 7ih7wa
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-24T07:39:16Z
---

## What to build

The three aids that make placement exact: rotation, snapping, and alignment. Elements rotate about their own centre because that is what the document stores; dragging an element finds the canvas's edges and centre lines and its neighbours' and draws a guide where it caught; and a row of buttons aligns or distributes a selection without anybody dragging anything.

closure waits for user review

## Acceptance criteria

- [ ] The rotation affordance is the zone just outside each corner handle, and rotation is always about the element's centre — there is no movable pivot. One modifier snaps to fifteen-degree steps.
- [ ] Rotation is stored normalized into a single turn and shown to one decimal. Worked example: rotating a shape at 350 degrees by another 20 stores 10, not 370.
- [ ] Rotating a multiple selection turns each member by the delta and orbits its position about the selection's centre.
- [ ] Moving or resizing snaps to the canvas edges and its horizontal and vertical centre lines, and to other elements' edges and centres, drawing a thin guide at each active snap. Worked example: dragging a shape so its centre is within the threshold of the canvas centre line lands it exactly on the centre and shows one guide.
- [ ] The snap threshold is measured in screen space, so the feel is the same at every zoom, and one modifier suspends snapping while held.
- [ ] Rotated elements snap by their axis-aligned bounding box.
- [ ] Six align actions and two distribute actions sit at the top of the inspector, computed on axis-aligned bounding boxes: one element aligns against the canvas, two or more against the selection's box, and distributing needs at least three. Worked example: three shapes at x of 0, 10 and 100, distributed horizontally, end up evenly spaced with the outer two unmoved.
- [ ] Each of these is one undo entry, and the guides and rotation zones live in the overlay, never in the document.

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on ep90f3 (the editor's canvas interactions and tool set): key bindings, modifier keys, the snap threshold, nudge and duplicate offsets, and new-element defaults. Read that note (beaver show ep90f3) before building - do not invent values the decision already fixed.

**agent** — 2026-08-24T07:39:16Z

Implemented rotation, snapping, alignment, and distribution through the parent spec's pure document-operation/store seam and the HTML overlay. Corner-adjacent rotation zones rotate one Element about its centre or orbit a multiple selection about its axis-aligned union centre; Shift snaps to 15 degrees, stored values normalize to [0, 360), and the inspector displays tenths. Move and Resize use mounted axis-aligned bounds, canvas/peer edge and centre targets, a 6 px screen-space threshold, Cmd/Ctrl suspension, and overlay-only active guides. The inspector now starts with all six axis-aligned align actions and both spacing distributions, with one Element targeting the canvas, multiple Elements targeting their union, and distributions preserving the outer pair. Every completed gesture/action crosses one store commit boundary. AFK seam tests cover normalization, stepped and multi-selection rotation, zoom-independent snapping and suspension, resize snapping, canvas/selection alignment, distribution, and one transition. pnpm check, all 73 web tests, and pnpm build pass. The required repository-wide pnpm test was attempted; its unchanged FastAPI suite cannot start because compose Postgres is not running. Closure waits for visual review: approve by closing glkll2, or note requested changes and remove needs-review.
