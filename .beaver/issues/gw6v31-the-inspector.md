---
id: gw6v31
title: The inspector
state: todo
priority: high
depends_on:
    - 8919ix
parent: ek7pq1
created: 2026-08-15T07:12:37Z
updated: 2026-08-15T07:12:37Z
---

## What to build

The inspector is the single authority for every property an element has. Fills including gradients, borders, shadows, opacity, corner radius, typography, and the raw numbers for position, size and rotation all live here, and so does the canvas background when nothing is selected. On-canvas controls stay limited to geometry handles, because gradient and shadow handles on the canvas are a large share of the editor's interaction work for properties that are set once and rarely touched again.

## Acceptance criteria

- [ ] Every property the schema defines for the selected element type is editable here: fill, border, shadow, opacity, corner radius, the typography set for text, and numeric position, size and rotation.
- [ ] A fill is solid or a gradient; a gradient is edited as a bar of stops with an offset each plus a numeric angle, and stops can be added, moved and removed. Worked example: a two-stop linear gradient at 90 degrees renders top to bottom, and the preview updates as the angle changes.
- [ ] Numeric fields accept typing and scrubbing; a scrub is one undo entry on release and a typed value one entry on commit, matching the undo rules already established.
- [ ] Editing a property with a multiple selection applies it to every selected element, and a field whose values differ across the selection says so rather than showing one of them.
- [ ] With nothing selected, the inspector edits the canvas: its dimensions and its background, solid or gradient.
- [ ] Changing the canvas size moves and scales nothing — coordinates are absolute and there is no anchoring — and triggers one full recompile.
- [ ] Because there are no rich spans, a typographic change applies to the whole text element whether or not part of its text is selected, and the inspector says element properties rather than pretending otherwise.
- [ ] Every value shown here matches what a handle drag produces for the same element, since both write the same document fields.
