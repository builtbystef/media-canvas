---
id: sazdn4
title: Workspaces, Memberships, and Roles
state: todo
priority: high
depends_on:
    - sycz8o
parent: 88v6vg
created: 2026-08-15T06:22:02Z
updated: 2026-08-15T06:22:02Z
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
