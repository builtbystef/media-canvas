---
id: 36ty5a
title: Purge a deleted Workspace's stored objects
state: todo
priority: medium
depends_on:
    - sazdn4
    - jr6mye
    - 92zwes
    - 211q1b
parent: 88v6vg
created: 2026-08-15T06:23:48Z
updated: 2026-08-17T03:56:03Z
---

## What to build

Deleting a Workspace takes its files with it, not just its database rows. The Owner who deletes a Workspace should not leave uploaded images, fonts, and generated outputs sitting in storage forever.

## Acceptance criteria

- [ ] Deleting a Workspace removes its database rows first, then its stored objects — assets and generated outputs alike.
- [ ] A crash between the two steps leaves objects behind and is accepted: the operation never leaves rows pointing at deleted files, and re-running the delete is safe. Worked example: a delete interrupted after the rows are gone can be re-run and completes the object removal without error.
- [ ] Deleting one Workspace never touches another Workspace's objects, including when both hold the identical bytes. Worked example: the same image uploaded in two Workspaces survives in the second after the first is deleted.
- [ ] The Owner is warned before deleting that files are removed and the action cannot be undone.
- [ ] Orphaned objects left by an interrupted delete are out of scope — no sweeper is built.

## Notes

**claude** — 2026-08-15T07:13:26Z

Retargeted 2026-08-15 (ek7pq1 issue-slicing session): the placeholder edge on the ek7pq1 umbrella is replaced by edges on the slices that actually gate this work. No umbrella edges remain anywhere in the tracker.
