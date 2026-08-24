---
id: 7ih7wa
title: Resize and scale handles
state: done
assignee: agent
priority: high
depends_on:
    - e5zpf3
parent: ek7pq1
created: 2026-08-15T07:12:37Z
updated: 2026-08-24T07:17:05Z
---

## What to build

Handles, and the fact that resizing and scaling are not the same operation. A rectangle resized keeps its two-pixel stroke two pixels; a text block dragged by a corner keeps its proportions and its look, because its font size travels with it; a group scaled multiplies everything its descendants own. Getting this split right is what stops the editor from quietly producing designs that look wrong one size up.

## Acceptance criteria

- [ ] Rectangles, ellipses and vectors resize: side handles change one dimension, corners change both, one modifier keeps the aspect and another works about the centre. The drag is interpreted in the element's own rotated frame, so the opposite edge stays visually pinned. Worked example: a rotated rectangle dragged by one side keeps the opposite side exactly where it was on screen.
- [ ] A resize leaves border width, corner radius and shadow untouched. Worked example: a 100 by 100 rectangle with a 2 px border, dragged to 400 by 400, still has a 2 px border.
- [ ] A vector's path and its view box are untouched by a resize, so a non-uniform drag stretches the artwork the way the compiler already scales it.
- [ ] Text scales: the two side handles set the wrap width and the block reflows, growing from its anchor, while the corner handles multiply width, font size, letter spacing and shadow offsets and blur by one factor so the block looks identical at a new size. There are no top or bottom handles, because height is computed.
- [ ] Images scale outside crop mode: a frame drag scales the framed content in step, keeping the same part of the bitmap in view.
- [ ] Groups scale uniformly and recursively from their corners only, multiplying every descendant's position, size, font size, letter spacing, border width, corner radius and shadow offsets and blur by one factor. Worked example: a group scaled by two doubles a nested text element's font size and its shadow blur, not only its box.
- [ ] A multiple selection offers move and uniform corner handles only — no side handles — because scaling a rotated member non-uniformly would need a skew the schema cannot store.
- [ ] Each handle drag is one undo entry, and the numbers it produces match what the inspector shows for the same element.

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on ep90f3 (the editor's canvas interactions and tool set): key bindings, modifier keys, the snap threshold, nudge and duplicate offsets, and new-element defaults. Read that note (beaver show ep90f3) before building - do not invent values the decision already fixed.

**agent** — 2026-08-24T07:17:05Z

Implemented Resize and Scale through the parent spec's pure document-operation/store seam and wired the resulting per-type handles into the canvas overlay. Rectangles, ellipses, and vectors resize in their rotated local frame with Shift aspect and Alt centre behavior while preserving Resize-owned decoration and vector source geometry. Text has wrap-width side handles and uniform corner Scale; images scale frame/content together; groups and multiple selections scale uniformly and recursively, including descendant decoration and typography. A completed handle gesture commits through one store action and keeps the touched selection. AFK seam tests cover the worked rotated-edge, fixed-border, vector, text, image, nested-group, multi-selection, handle-set, and single-transition examples. pnpm check, all 59 web tests, and pnpm build pass. The repository-wide pnpm test was attempted but its unchanged FastAPI suite cannot start because compose Postgres is not running; this harness denied docker compose up -d by policy.
