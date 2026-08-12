---
id: 73rm0x
title: How do editor document state, undo/redo, and persistence work?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - ep90f3
parent: v1xa7j
created: 2026-08-12T02:58:24Z
updated: 2026-08-12T02:58:24Z
---

Interview the user (grill-me skill, limited to this question) to settle how the editor holds, mutates, and saves a Design Document.

The Frontier lists undo/redo as open. The core spec fixes the ground it stands on: "editor-authored state lives only in the Design Document", and the document is "structured, versioned" with a required integer `schemaVersion` and forward-only migrations applied at load. User story 1 of that spec is that the editor can always reopen a saved design. Nothing yet says what an edit *is* as a unit, or when bytes reach Postgres.

Settle: the client-side state model (a command/patch log versus whole-document snapshots) and what one undoable transaction is — a drag gesture is one entry, but is a run of typing? does a multi-select move coalesce?; the undo stack's depth and whether it survives a reload; how selection interacts with undo (does undoing a move restore the selection?); the save model (explicit save versus autosave, and on what trigger); whether saved documents are versioned in storage and whether the user can restore an earlier one; the endpoints and Postgres tables for documents and Templates under ADR-0005, and how a Template relates to the design it was promoted from; what happens to an open editor when the same document changes elsewhere; and where migrations run when a stored document predates the current `schemaVersion`.

Note two settled constraints that bound the answer: the renderer accepts only the current `schemaVersion` (node 53lwlc), and the generation platform snapshots the Template at Job submission so in-flight batches are immune to later edits (issue 0egsmf) — whatever versioning this node chooses must not contradict that snapshot rule.

Input: node 53lwlc (format and migration strategy), the core spec 1qoccb, the generation platform spec 0egsmf, ADR-0001 and ADR-0005, and the interaction model settled by node ep90f3 — transactions are defined in terms of the gestures that produce them.
