---
id: glkll2
title: Rotation, snapping, and alignment
state: todo
priority: high
depends_on:
    - 7ih7wa
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:43Z
updated: 2026-08-15T07:12:43Z
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
