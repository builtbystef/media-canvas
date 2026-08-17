---
id: k7wegl
title: Workspace Invites
state: todo
priority: medium
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:12Z
updated: 2026-08-17T04:00:39Z
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
