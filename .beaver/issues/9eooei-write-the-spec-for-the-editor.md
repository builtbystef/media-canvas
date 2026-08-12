---
id: 9eooei
title: Write the spec for the editor
state: todo
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
updated: 2026-08-12T02:58:44Z
---

The area: the editing surface verdict (node vnmueh), the asset upload pipeline (node 3ko2p7), canvas interactions and the tool set (node ep90f3), document state and undo/redo (node 73rm0x), and template promotion (node 8h50hu). When those are closed, read their notes and linked artifacts, interview to close remaining gaps (grill-me skill), confirm with the user, then invoke the create-specification skill.

This spec is the implementer's contract for the third pillar: the Next.js editor, its state model, and the asset upload endpoints that feed it. It sits on top of the core spec (1qoccb), which owns the schema, the compiler, and the render seam, and beside the generation platform spec (0egsmf), which owns jobs, the worker fleet, and file serving. Neither is reopened here — where the editor needs something they forbid, that is a spec amendment to raise, not an implementation choice.

Add glossary terms settled along the way to docs/GLOSSARY.md.
