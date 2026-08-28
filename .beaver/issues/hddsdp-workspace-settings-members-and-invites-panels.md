---
id: hddsdp
title: 'Workspace settings: members and invites panels'
state: done
assignee: agent
priority: medium
depends_on:
    - k7wegl
    - jmpc8g
parent: 88v6vg
created: 2026-08-15T06:22:53Z
updated: 2026-08-28T20:40:58Z
---

## What to build

The settings area where an Owner runs their Workspace's access without a terminal: who is in it and with what Role, and who has been invited but has not arrived yet. This slice also establishes the settings area itself — its route, its layout, and how it refuses people who are not Owners.

## Acceptance criteria

- [ ] The settings area is reachable from the product for any member; panels whose actions are Owner-only are visible but inert for Editors and Viewers, and the area never offers an action the api will refuse.
- [ ] The members panel lists every member with their email and Role, and lets an Owner change a Role or remove a member.
- [ ] The last-Owner rules surface as messages, not as failures. Worked examples: an Owner trying to demote the only Owner is told why it is refused; the same Owner trying to leave is told to promote someone first.
- [ ] Any member can leave from this area, with a confirmation, and lands outside the Workspace afterwards.
- [ ] The invites panel lists pending invites with their email, Role, and when they expire, and lets an Owner send a new one by email and Role, or revoke one.
- [ ] Inviting an address that already has a pending invite replaces it, and the panel shows one entry rather than two.
- [ ] The panel states plainly that an invite email has been sent, including in development where it lands in the api log.
- [ ] The settings area also carries the Workspace itself: an Owner renames it in place through the existing workspace surface (sazdn4), and deletes it behind an explicit confirm that warns members lose access and stored files are removed irreversibly. The deletion and storage-purge semantics themselves belong to sazdn4 and 36ty5a — this panel only fronts them.

## Notes

**agent** — 2026-08-28T05:58:39Z

Seam: the web app's pure modules (88v6vg third seam / kjgubg). Criteria are the eight on the issue; no invention. Behaviour extracted to lib/settings.ts (Role affordances, last-Owner messages, invite wording and expiry) and the existing failures / workspaces / routes modules. Pages stay a gate and a hand-off — no component harness.

**agent** — 2026-08-28T20:40:56Z

Built the settings area. `/settings` is reachable from Documents | Jobs | Settings. Any member may open it; Owner-only actions stay visible but inert. `pnpm check` green. 426 TS tests green. API tests not re-run (web-only slice; sandbox cannot reach loopback Postgres).

**What landed.** `app/settings/page.tsx` is the server page — session, members list, invites list only when the Role may see it. Three client panels: Workspace (in-place rename, delete with the 36ty5a warning), Members (role change, remove, leave with confirm), Invites (send by email and Role, pending list with expiry, revoke). `ListNav` gained Settings. Behaviour worth testing is in `lib/settings.ts` (Role affordances, last-Owner messages, invite wording and expiry) plus the existing failures / workspaces / routes modules.

**Seam.** The web app's pure modules (88v6vg third seam / kjgubg). Pages stay a gate and a hand-off — no component harness.

**Decisions a reviewer should know.**

- *Panels remount on Workspace switch* via `key={workspaceId}`, same as the jobs list, so another Workspace's members never linger.
- *Invites are not fetched for a Role the api would refuse.* Editors and Viewers still see the panel and why it will not act.
- *Last-Owner demotion and leave are intercepted in the module* and shown as reasons, not as `failedToChangeMembership`. A 409 from the api is the same words if the client is stale.
- *Demoting yourself refreshes the page* so Owner-only actions go inert the moment the Role is no longer Owner.
- *API keys are y0dxtu.* This slice is members, invites, and the Workspace itself.

**Testing.** `lib/settings.test.ts` (9). Failures for membership, rename, invite send/revoke, and Workspace delete. `WORKSPACE_DELETE_WARNING` names members losing access.
