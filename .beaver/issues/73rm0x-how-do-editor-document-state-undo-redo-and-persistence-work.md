---
id: 73rm0x
title: How do editor document state, undo/redo, and persistence work?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - ep90f3
parent: v1xa7j
created: 2026-08-12T02:58:24Z
updated: 2026-08-14T05:19:20Z
---

Interview the user (grill-me skill, limited to this question) to settle how the editor holds, mutates, and saves a Design Document.

The Frontier lists undo/redo as open. The core spec fixes the ground it stands on: "editor-authored state lives only in the Design Document", and the document is "structured, versioned" with a required integer `schemaVersion` and forward-only migrations applied at load. User story 1 of that spec is that the editor can always reopen a saved design. Nothing yet says what an edit *is* as a unit, or when bytes reach Postgres.

Settle: the client-side state model (a command/patch log versus whole-document snapshots) and what one undoable transaction is — a drag gesture is one entry, but is a run of typing? does a multi-select move coalesce?; the undo stack's depth and whether it survives a reload; how selection interacts with undo (does undoing a move restore the selection?); the save model (explicit save versus autosave, and on what trigger); whether saved documents are versioned in storage and whether the user can restore an earlier one; the endpoints and Postgres tables for documents and Templates under ADR-0005, and how a Template relates to the design it was promoted from; what happens to an open editor when the same document changes elsewhere; and where migrations run when a stored document predates the current `schemaVersion`.

Note two settled constraints that bound the answer: the renderer accepts only the current `schemaVersion` (node 53lwlc), and the generation platform snapshots the Template at Job submission so in-flight batches are immune to later edits (issue 0egsmf) — whatever versioning this node chooses must not contradict that snapshot rule.

Input: node 53lwlc (format and migration strategy), the core spec 1qoccb, the generation platform spec 0egsmf, ADR-0001 and ADR-0005, and the interaction model settled by node ep90f3 — transactions are defined in terms of the gestures that produce them.

## Notes

**claude** — 2026-08-14T05:19:14Z

ANSWER (settled by interview, user confirmed 2026-08-14). Glossary gained: Undo Entry, Revision. No new ADR — every choice here either follows from ADR-0003/0005/0006 or is reversible client-side.

CLIENT STATE MODEL: whole-document immutable snapshots with structural sharing. ADR-0006 already forces per-element immutability (the preview memoizes on element object identity), so every edit produces a new document object that shares unchanged elements — a "snapshot" costs one small object, not a deep copy. The undo stack is an array of past document values; undo/redo moves a pointer. A command/patch log was rejected: it re-implements what structural sharing gives free, and inverse-operation bugs are the classic undo failure mode.

UNDO ENTRY (one per completed gesture, never per frame):
- A drag (move/resize/scale/rotate/crop) is one entry; a multi-select gesture is ONE entry regardless of member count — the gesture is the unit, not the element.
- Typing: one entry per text-editing session (enter editing -> exit). No keystroke coalescing rules; text edits on a design canvas are short.
- Inspector: a slider/scrub drag coalesces to one entry on release; a typed field commits one entry on blur/Enter.
- Selection changes are never undo entries, but undoing an entry RESTORES selection to the elements that entry touched (Figma behavior — undo shows you what changed).
- Stack: in-memory only, does not survive reload, capped at 200 entries. Persisting it would buy little once saves are reliable and would cost a serialization format that needs migrating. Redo stack clears on a new edit (standard).

SAVE MODEL: autosave. Debounced ~1 s after the last mutation, immediate flush on tab hide/close, saving/saved indicator, Cmd-S exists only as "flush now". No version history in v1 — one current JSON per document; undo covers in-session mistakes, promotion copies protect templates, job snapshots protect batches. Version history (list/preview/restore) goes to the Frontier.

CONCURRENCY: optimistic. Each document row carries integer `revision`; every save PUT sends the revision it loaded and receives the incremented one; mismatch -> 409 and a blocking "changed elsewhere — reload" notice. No merging, no live sync — this prevents silent clobbering for a single user, nothing more.

TABLES (owned by FastAPI/Alembic per ADR-0005): ONE `documents` table:
  id UUID PK, kind ('design'|'template'), name TEXT, document JSONB,
  schema_version INT (denormalized from the JSON for ops queries — FastAPI still never interprets internals),
  revision INT, promoted_from_id UUID NULL FK documents ON DELETE SET NULL (lineage only, no behavior),
  created_at, updated_at
Rejected: separate designs/templates tables — the asset tables split (3ko2p7) because font and image metadata shared almost nothing; here the columns are 100% shared, and "editor opens a document by id" stays one code path. `generation_jobs.template_id` FKs this table; deleting a template sets it NULL and touches nothing else (the snapshot already made jobs immune).

ENDPOINTS (under /api/v1): POST /documents; GET /documents?kind=; GET /documents/{id}; PUT /documents/{id} (the autosave target, revision-checked); DELETE /documents/{id}; POST /documents/{id}/promote (copies a design into a new template row — UI belongs to node 8h50hu). The generation spec's /templates/{id}/render and /templates/{id}/jobs stand unchanged: they resolve a documents row with kind='template', 404 otherwise.

MIGRATIONS: live in the core package and run wherever a document enters core — the editor migrates at load (next autosave persists the current schemaVersion); the worker migrates a job's template snapshot in memory at load, so an old snapshot still renders after a schema bump. FastAPI stores and serves bytes and never migrates (it cannot: core is TypeScript-only, ADR-0003). This keeps the snapshot rule intact: renderer accepts only the current version, and migration-at-load is how an old snapshot reaches it.

CONSEQUENCE FOR DEPENDENT NODES: 9eooei specs all of this alongside ep90f3's interaction model; 8h50hu inherits POST /documents/{id}/promote and the promoted_from_id lineage as the substrate its promotion UI drives.
