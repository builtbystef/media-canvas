---
id: sazdn4
title: Workspaces, Memberships, and Roles
state: done
assignee: claude
priority: high
depends_on:
    - sycz8o
parent: 88v6vg
created: 2026-08-15T06:22:02Z
updated: 2026-08-18T08:31:34Z
---

## What to build

A signed-in User creates a Workspace and becomes its Owner — no admin, no seed step, no waiting for anyone. Membership is the only path to a Workspace's content, and the Role on that Membership is what every later route in the product consults: a Viewer reads and downloads, an Editor also changes content and runs generation, an Owner also manages the Workspace and who is in it.

## Acceptance criteria

- [ ] Any signed-in User creates a Workspace and becomes its Owner. `GET /me` then lists that Membership with its Workspace and Role.
- [ ] Listing members is open to any member of the Workspace; changing a Role, removing a member, renaming the Workspace, and deleting it are Owner-only. Worked example: an Editor calling the role-change endpoint → 403.
- [ ] The last Owner cannot be demoted, removed, or leave. Worked examples: the sole Owner calling leave → 409; after promoting a second member to Owner, the same call → 204.
- [ ] Any member who is not the last Owner may leave, which removes only their own Membership.
- [ ] Deleting a Workspace removes every database row belonging to it in one operation. Worked example: after deletion, its former members' `/me` no longer lists it, and its id is refused by every Workspace-scoped route.
- [ ] A caller with no Membership in a Workspace is refused, and cannot learn whether it exists. Worked example: the same response comes back for a real Workspace id the caller does not belong to and for a random one.
- [ ] The Role check is one shared mechanism that later routes apply, rather than a rule re-implemented per route. Worked example: adding a route that requires Editor takes a declaration, not a hand-written check.
- [ ] Out of this slice, and tracked as their own issues: seeding the bundled fonts into a new Workspace, and removing a deleted Workspace's stored objects. Both need the asset pipeline, which does not exist yet.

## Notes

**claude** — 2026-08-18T08:30:48Z

Done. Workspaces, Memberships and the Role gate are in the api. The settings UI is hddsdp, the way a second person gets in is k7wegl (Invites), and font seeding (vn4r07) and object purging (36ty5a) stay out, as the last criterion says.

**What landed.** `models.py` gains `Role` (a StrEnum whose declaration order is the ladder), `Workspace`, and `Membership`, with migration `0003_workspaces`. `memberships.py` is the domain: create a Workspace with its creator as Owner, read who is in one, reassign, release, close, and the last-Owner invariant. `workspaces.py` is the router: create, rename, delete, list members, change a Role, remove a member, leave. `access.py` gains `requiring()` and the three declarations it produces. `views.py` holds the JSON shapes more than one router answers with. `/me` now lists real Memberships.

**Decisions a reviewer should know.**

- *The Role check is a dependency factory, not a helper routes call.* `requiring(role)` in `access.py` resolves the caller's Membership in the Workspace the path names and hands it to the route; `Viewing` / `Editing` / `Owning` are the three declarations. A route that ran at all has been checked, and it cannot have been checked wrongly — the route body has no access code in it, and gets the Membership it would otherwise have looked up. `Role.covers()` is the ladder: an Owner passes an Editor's gate.
- *Path parameters are camelCase, matching the operation ids.* `/workspaces/{workspaceId}/members/{userId}`, read in Python as `Annotated[UUID, Path(alias="workspaceId")]`. The generated TypeScript client takes `{ workspaceId }`, which is what the spec's route table writes and what the web app will want. The gate does the extraction, so routes never declare the id at all.
- *A stranger and a nonexistent Workspace get the same 404 by construction*, not by two branches that were remembered to agree: the gate's only question is whether the caller has a Membership, and no route runs before it answers.
- *The last-Owner rule lives with the model, not the routes.* `reassign` and `release` raise `LastOwner`; the three routes that can empty the Owner seat translate it to 409. Promoting somebody else first is the way to hand a Workspace over.
- *Delete is one statement.* `DELETE FROM workspaces WHERE id = ...`, with `ON DELETE CASCADE` on every table that references it. Later slices' tables inherit the criterion by declaring that FK, and the test reads the route list out of the OpenAPI schema, so a Workspace-scoped route added later is covered without editing the test.
- *A native Postgres enum named `role`*, created by this migration. The invites and api-key slices give the same three Roles to their own columns and must reuse the type (`sa.Enum(..., name="role", create_type=False)`) rather than declare a second one.
- *Workspace names are trimmed and 1–100 characters.* No criterion names a limit; empty names would be unpickable from a list, and the column has to have a width.

**Testing.** The spec's seam — the public HTTP API against a real Postgres. `tests/test_workspaces.py` carries the six behavioural criteria, each from the criterion's own worked example. Criterion 7 is `tests/test_access.py`: it mounts one extra route declared with `Editing` onto an api built from the same lifespan, and asserts Owner 200 / Editor 200 / Viewer 403 — the test *is* the worked example, since no shipped route needs Editor yet.

Two test-support facts. A second member has no product route until Invites land, so the `joining` fixture writes the Membership row directly; it is arrangement only, and every claim is still read at the HTTP seam. And `sign_in` moved out of `test_auth.py` into conftest as `Accounts`, which also switches which of several signed-in people the client currently is — three test modules were importing the old helper from `test_auth`.

**Checks.** `pnpm run ci` green: check, 43 api tests + 20 TS tests, build. `openapi.json` and the generated client are regenerated and committed. No new dependency.
