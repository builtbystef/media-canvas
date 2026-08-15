---
id: f2hjkt
title: 'Compile groups: nesting, group opacity, and rotation'
state: todo
priority: medium
depends_on:
    - aclv2a
parent: 1qoccb
created: 2026-08-15T05:49:06Z
updated: 2026-08-15T05:49:06Z
---

## What to build

Groups compile so that a group behaves as one object: its children move with it, its opacity fades the group as a single unit rather than each child separately, and rotating it turns the whole arrangement about its middle. A designer who groups two overlapping shapes and drops the group to 50% sees one translucent object, not a seam where the two overlap.

## Acceptance criteria

- [ ] A group draws its children in order, with child coordinates taken as relative to the group's origin, and groups nest to any depth. Worked example: a group at (100, 50) containing a rect at (10, 10) paints that rect at (110, 60) on the canvas.
- [ ] Group opacity composites the group as one unit. Worked example: two overlapping opaque rects inside a group with `opacity: 0.5` show the top rect at 50% over the background in the overlap — not a darker doubly-composited patch.
- [ ] Group rotation is about the bounding-box center of its children, in the group's own coordinates. Worked example: children spanning local x 0..200 and y 0..100 rotate about the point (100, 50).
- [ ] `visible: false` on a group hides the group and everything under it; a hidden child inside a visible group hides only itself.
- [ ] A group has no width or height of its own — its bounds derive from its children — and adding, moving, or hiding a child changes those bounds accordingly.
