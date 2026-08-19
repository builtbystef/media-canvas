---
id: f2hjkt
title: 'Compile groups: nesting, group opacity, and rotation'
state: done
assignee: claude
priority: medium
depends_on:
    - aclv2a
parent: 1qoccb
created: 2026-08-15T05:49:06Z
updated: 2026-08-19T02:18:39Z
---

## What to build

Groups compile so that a group behaves as one object: its children move with it, its opacity fades the group as a single unit rather than each child separately, and rotating it turns the whole arrangement about its middle. A designer who groups two overlapping shapes and drops the group to 50% sees one translucent object, not a seam where the two overlap.

## Acceptance criteria

- [ ] A group draws its children in order, with child coordinates taken as relative to the group's origin, and groups nest to any depth. Worked example: a group at (100, 50) containing a rect at (10, 10) paints that rect at (110, 60) on the canvas.
- [ ] Group opacity composites the group as one unit. Worked example: two overlapping opaque rects inside a group with `opacity: 0.5` show the top rect at 50% over the background in the overlap — not a darker doubly-composited patch.
- [ ] Group rotation is about the bounding-box center of its children, in the group's own coordinates. Worked example: children spanning local x 0..200 and y 0..100 rotate about the point (100, 50).
- [ ] `visible: false` on a group hides the group and everything under it; a hidden child inside a visible group hides only itself.
- [ ] A group has no width or height of its own — its bounds derive from its children — and adding, moving, or hiding a child changes those bounds accordingly.

## Notes

**claude** — 2026-08-19T02:18:39Z

DONE. The `group` case in packages/core/src/compile.ts, with the extent derivation its rotation center needs. 12 tests in compile.test.ts, at the seam the spec names (seam 1: document in, SVG string out). `compile` now covers every v1 element type — the "not implemented yet" default is gone and the switch is exhaustive.

Decisions this session made:

- A GROUP IS ONE `<g>`, ALWAYS: the translate for its origin, the rotate for its turn, and its opacity all ride on that one element, and a group with none of the three still gets it. A group is the one element type SVG has a construct of its own for, and one node per element is what ADR-0006's per-element DOM patching wants.
- THE TRANSFORM IS `translate(origin) rotate(angle center)`, in that order, so that the rotation center is written in the group's own coordinates — literally the point the criterion names — instead of being translated into canvas coordinates first.
- CHILDREN KEEP THEIR OWN COORDINATES: the origin is a translate, not something added into each child's geometry. This is also what keeps a child's `userSpaceOnUse` definitions right, though they are hoisted into the document's one `<defs>`: SVG reads a user-space definition in the user space of the element referencing it, which inside a group is the translated one. A test pins a child's gradient line and shadow filter region reading 0..40 rather than 100..140.
- A GROUP'S EXTENT IS THE UNION OF WHAT ITS CHILDREN DRAW, and a child's own rotation counts into it — the axis-aligned box the turned child actually reaches. A border or a shadow spilling past an edge does not widen it: those are effects on the edge, not the geometry the document authored.
- AN ELEMENT THAT DRAWS NOTHING HAS NO EXTENT — hidden, or a text element with no lines — so hiding a child moves the middle its group turns about. A group whose children all draw nothing compiles to nothing at all: no `<g>`, and no definition left behind either.
- A TEXT CHILD CONTRIBUTES THE BLOCK OF LINE BOXES IT LAID OUT, since a text element carries no height of its own. A group's extent therefore depends on font metrics, which is why the extent lives in the compiler rather than anywhere upstream of it.

Facts a reviewer needs:

- The extent is computed only when the group actually rotates, since that is all it is read for in this slice. It is internal: no seam signature changed, and nothing in the issue asks the editor for a group's bounds.
- A rotating group lays its text children out twice — once for the extent, once for the markup. ADR-0006's memoization (n5csrl) removes that, and nothing here blocks it: the extent depends only on the element and the fonts already loaded.
- The pinned render environment tuple (apps/worker/environment.json) carries a hash of the compiler, so it was rewritten with `pnpm --filter worker run environment:write`. Baselines bound to the old compiler are invalidated deliberately; none are baked yet.
- No new dependency.
