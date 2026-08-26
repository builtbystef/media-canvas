---
id: k7wegl
title: Workspace Invites
state: done
assignee: agent
priority: medium
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:12Z
updated: 2026-08-26T18:42:20Z
---

## What to build

An Owner types an email address, picks a Role, and the person named receives a link that puts them in the Workspace — creating their account on the way in if the instance has never seen that address. It is the only way a second person reaches a Workspace, and it needs no administrator.

## Acceptance criteria

- [ ] An Owner sends an invite for an email address and a Role; the Mailer receives the Workspace name, the Role, and an acceptance link. Worked example: the recording fake captures a link whose base is `https://{DOMAIN}` when a domain is configured, the configured public URL when it is not, and the development editor origin when neither is set.
- [ ] Only Owners send, list, and revoke invites, and listing returns the pending ones. Worked example: an Editor calling the invite endpoint → 403.
- [ ] There is at most one pending invite per email per Workspace: inviting the same address again replaces the pending invite rather than adding a second.
- [ ] Following the link's token, `GET /api/v1/invites/{token}` requires no session and returns the Workspace name, the offered Role, and the invited email for a pending invite, with the same refusals accepting carries: 404 for used, revoked, or unknown; 410 for expired. It reveals nothing beyond that one invite, and it is the only invite call besides accept that works without a session — the acceptance page (50gsoy) is its consumer.
- [ ] Accepting requires no session. It creates the User when the email is new, creates the Membership with the invited Role, and signs the caller in as the invite's User — replacing any session the caller already holds, so the browser ends signed in as the invited account. Worked example: accepting unauthenticated → 204 with a session cookie, and `/me` then lists that Workspace with the invited Role.
- [ ] An invite is single-use and expires after seven days. Worked examples: accepting a second time → 404; accepting after seven days → 410; accepting a revoked or unknown token → 404.
- [ ] Accepting an invite for an email that already has an account attaches the Membership to that existing User rather than creating a second one.

## Notes

**claude** — 2026-08-17T04:00:39Z

Amended: adds the unauthenticated invite preview call GET /api/v1/invites/{token} (workspace name, role, invited email; 404/410 exactly as accept), and states that accepting signs the caller in as the invite's User, replacing any existing session. Decided together with the acceptance page 50gsoy; the parent spec's endpoint surface gains the same route.

**agent** — 2026-08-26T18:29:02Z

Seam: the spec's public HTTP API against a real Postgres and the recording Mailer. Criteria are the seven on the issue; no invention.

**agent** — 2026-08-26T18:42:20Z

Done. Workspace Invites are in the api. The acceptance page is 50gsoy; the settings panels are hddsdp.

What landed. models.py gains Invite with migration 0008_invites (reuses the role enum). invites.py is the domain and the router: send, list pending, revoke, preview, accept. Preview and accept join the session-exemption list as a /api/v1/invites/ prefix. OpenAPI and the generated client are regenerated.

Decisions a reviewer should know.

Used and revoked are gone rows, not a status column. The spec's table has no consumed_at. Accept and revoke delete the row, so a second accept, a revoked token, and an unknown token are all 404 by construction. Expired rows stay and return 410.

One pending invite per (workspace, email) is a unique constraint. Re-inviting deletes the existing row (pending or expired) and inserts a new token. Addresses are stored lowercased, same as User.

The accept link is public_base_url + /invites/{token}. That property already implements the spec's derivation (https://{DOMAIN}, else PUBLIC_URL, else the editor origin).

Preview names only this invite: workspace_name, role, email — no workspace id.

Accept replaces any session the caller holds. The presented cookie's row is deleted, a new session is opened for the invite's User, and Set-Cookie overwrites the browser. An existing User is found by email; a new one is created. A Membership that already exists is left as it is.

List and create return id, email, role, expires_at so the settings panel (hddsdp) can revoke by id and show expiry.

Testing. The spec's seam — the public HTTP API against a real Postgres and the recording Mailer. tests/test_invites.py carries the seven criteria from their worked examples. The public-route inventory and the workspace-delete cascade pick the new routes up from the schema.

Checks. pnpm check green. Api tests 175 passed. openapi.json and the generated client regenerated.
