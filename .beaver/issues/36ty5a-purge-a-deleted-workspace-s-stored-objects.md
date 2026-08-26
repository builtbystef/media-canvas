---
id: 36ty5a
title: Purge a deleted Workspace's stored objects
state: done
assignee: agent
priority: medium
depends_on:
    - sazdn4
    - jr6mye
    - 92zwes
    - 211q1b
parent: 88v6vg
created: 2026-08-15T06:23:48Z
updated: 2026-08-26T20:15:02Z
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

**agent** — 2026-08-26T20:05:39Z

Seams (AFK, spec 88v6vg): (1) the public HTTP API against real Postgres and Garage, for the purge — rows first, objects second, isolation, and a safe re-run. Tests go in test_workspaces.py next to the existing delete cases. (2) the web app's pure modules, for the warning copy the Owner is shown; the settings panel that presents it is hddsdp, which this issue does not build.

**agent** — 2026-08-26T20:15:01Z

Done. Deleting a Workspace now removes its stored objects after its rows.

What landed
- DELETE /workspaces/{id} deletes the Workspace row (FK cascade) first, then prefix-deletes `{id}/` in both the assets and outputs buckets — bundled fonts, uploads, and generated outputs.
- A crash after the commit leaves the objects; that is accepted. A second DELETE, once the rows are gone, still runs the prefix delete (idempotent) and answers the same 404 a stranger gets for a Workspace that never existed, so it cannot leak whether the id was real.
- A live Workspace a caller does not belong to is still 404 with no purge.
- Warning copy: `WORKSPACE_DELETE_WARNING` in apps/web/lib/workspaces.ts. The settings panel that presents it is hddsdp.

Decisions
- The leftover-purge path cannot use `Owning`: after the rows go, there is no Membership. The route looks up the Membership itself, reuses `refuse_unless` for the live-Owner case, and only purges on 404 when the Workspace row is already gone.
- Isolation is the storage key layout: the same bytes in two Workspaces are two keys. Prefix `{id}/` cannot reach a neighbour.

Tests (seam 1, test_workspaces.py): objects gone after delete; rows gone / objects remain when prefix-delete fails; re-run finishes the purge; neighbour copy of the same bytes survives; a stranger's DELETE is 404 and leaves the files. Seam 3: the warning names files-removed and cannot-be-undone.

Checks: pnpm check green. API pytest 187 passed (compose Postgres/Garage via sandbox sockets / stack.local). vp test 402 passed. No new dependency. OpenAPI unchanged.
