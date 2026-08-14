---
id: 9eooei
title: Write the spec for the editor
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - vnmueh
    - 3ko2p7
    - ep90f3
    - 73rm0x
    - 8h50hu
parent: v1xa7j
created: 2026-08-12T02:58:44Z
updated: 2026-08-14T07:14:05Z
---

The area: the editing surface verdict (node vnmueh), the asset upload pipeline (node 3ko2p7), canvas interactions and the tool set (node ep90f3), document state and undo/redo (node 73rm0x), and template promotion (node 8h50hu). When those are closed, read their notes and linked artifacts, interview to close remaining gaps (grill-me skill), confirm with the user, then invoke the create-specification skill.

This spec is the implementer's contract for the third pillar: the Next.js editor, its state model, and the asset upload endpoints that feed it. It sits on top of the core spec (1qoccb), which owns the schema, the compiler, and the render seam, and beside the generation platform spec (0egsmf), which owns jobs, the worker fleet, and file serving. Neither is reopened here — where the editor needs something they forbid, that is a spec amendment to raise, not an implementation choice.

Add glossary terms settled along the way to docs/GLOSSARY.md.

## Notes

**claude** — 2026-08-14T07:14:05Z

ANSWER: the editor spec is published as issue ek7pq1 ('Editor and asset pipeline', label spec), with blocking edges back to the five area nodes (vnmueh, 3ko2p7, ep90f3, 73rm0x, 8h50hu) whose closure notes it binds as normative.

Gaps closed by this session's interview (user confirmed 2026-08-14), now recorded in the spec:
- App shell: document list at the root (tabs All/Designs/Templates, promote + delete row actions), editor at a per-document URL; rename in place in the editor top bar.
- Creation: a dialog with six Canvas Presets (IG post/story, FB post, X post, A4 poster, Full HD) or custom dimensions; new designs start 'Untitled', white background.
- Asset list endpoints (the one gap 3ko2p7 left): GET /api/v1/fonts and GET /api/v1/images, all records, newest first, unpaginated.
- Text editing: hidden textarea for input; caret/selection drawn in the overlay from a new core export layoutText() — the compiler's own line-breaking code exposed, never re-implemented. contenteditable rejected outright.
- Frontend: React owns shell/panels/overlay, the compiled SVG lives outside reconciliation and is patched imperatively (ADR-0006); Zustand store; Tailwind + shadcn/ui (Base UI variant); Vitest + @playwright/test.
- Autosave failure (non-409): keep editing, exponential backoff retry, warning indicator; never a modal.
- Browser support: Chromium-based only, untested elsewhere, not gated.
- Theme: light/dark by system preference, stock shadcn tokens, no toggle.
- Derived at drafting, flagged and approved: promote on a template returns 422; layoutText signature.
- Repository layout deliberately NOT in the spec — handed to issue g4y1ii (noted there with the fixed deps as input to its stack grill).

Next step: invoke the create-issues skill with ek7pq1 to slice it for implementation.
