---
id: 6lxoec
title: Write the spec for the design format and rendering core
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:spec
    - spec
depends_on:
    - 53lwlc
    - gqr8bf
    - k77nv9
    - oxcf2v
    - ud46e4
parent: v1xa7j
created: 2026-08-08T07:09:31Z
updated: 2026-08-10T19:14:54Z
---

The area: the design document format (node 53lwlc), the rendering approach and its fidelity verdict (nodes 7mza2q, gqr8bf), the font contract (node oxcf2v), and templating semantics (node k77nv9). When those are closed, read their notes and linked artifacts, interview to close remaining gaps (grill-me skill), confirm with the user, then invoke the create-specification skill.

This spec is the implementer's contract for the core: the schema, the renderer, and the variable semantics that editor and workers must both honor. Add glossary terms settled along the way to docs/GLOSSARY.md.

## Notes

**claude** — 2026-08-10T19:14:51Z

ANSWER (spec session, user approved 2026-08-10): the core-area spec is published as issue 1qoccb — 'Design format and rendering core' — with blocking edges to the six nodes it covers (53lwlc, 7mza2q, gqr8bf, k77nv9, oxcf2v, ud46e4). The issue body is the implementer's contract: full schema v1 type shapes, validation semantics, compiler rules, seam signatures, dependencies, and testing decisions.

Decisions settled in THIS session (by interview, not inherited from the area's nodes):
1. Pinned headless flavor: full Chromium new headless (Playwright channel 'chromium'), NOT chrome-headless-shell — same render path as the desktop Chrome the editor runs in; the measured 0.53% fork is against the shell build.
2. One shared TypeScript core package owns schema types, validation, resolve, and the JSON->SVG compiler; the render worker is Node + Playwright in TypeScript; FastAPI orchestrates but never interprets document internals. Recorded as ADR docs/adr/0003-shared-typescript-core.md. Standing preference: all Node code is TypeScript.
3. Compiled markup is SVG (pre-broken tspans, prototype-proven).
4. Images are content-addressed Image Assets mirroring the Font Asset precedent (glossary term added); element src = asset id; Variable image value = asset id or external URL.
5. Full per-element property sets: common id/name/x/y/rotation/opacity/visible(bindable); borders (centered stroke, color+width) on rect/ellipse/vector/image; uniform drop shadow (dx/dy/blur/color/opacity) on all paint elements incl. text; cornerRadius on rect + image frame, uniform number OR per-corner object (per-corner compiles rect to <path>); gradients linear (angle+stops) and radial (bbox-centered) on shape fills + canvas background only; text adds letterSpacing (px), align left/center/right, lineHeight multiplier.
6. Vector element = one path + one fill + viewBox for deterministic scaling; SVG import flattens to a group of single-path vectors.
7. Over-wide word breaks mid-word at character granularity in the compiler.
8. Unknown {{token}} is a validation error; no escape syntax for literal {{ in v1; number interpolation = ECMAScript String(number).
9. Export options: PNG scale 1/2/3, JPEG quality (default 90, over white), PDF 1px = 1/96in via printToPDF.
10. Test seams (user-agreed, three): compile() unit/snapshot; validate() rule table; render() goldens in the pinned worker image only, ud46e4 tolerances.

Next step: invoke the create-issues skill with 1qoccb to slice the spec into implementation issues.
