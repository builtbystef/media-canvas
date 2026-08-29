---
id: 50gsoy
title: The invite acceptance page
state: done
assignee: agent
priority: medium
depends_on:
    - k7wegl
    - jmpc8g
parent: 88v6vg
created: 2026-08-15T06:22:46Z
updated: 2026-08-29T06:10:05Z
---

## What to build

The page at the end of an invite email. The recipient clicks the link, sees which Workspace they are being invited to and as what, accepts, and is signed in and inside — whether or not they had an account a moment earlier.

## Acceptance criteria

- [ ] Following an invite link shows the Workspace name and the offered Role before anything is accepted, read from the unauthenticated invite preview call (`GET /api/v1/invites/{token}`, contract on k7wegl).
- [ ] Accepting signs the visitor in and lands them in that Workspace, with no separate sign-in step. Worked example: a recipient who has never used the instance goes from the email link to the product in one click.
- [ ] A link that was already used, revoked, or never existed shows a clear message and a way to the sign-in page — not a blank error.
- [ ] An expired link says so specifically, and tells the recipient to ask the Owner for a new invite.
- [ ] A visitor who is already signed in as a different person is not silently switched: before the accept action, the page states the invited email the Membership will attach to and that accepting signs them in as that account, replacing the current session — which is what the accept call then does (k7wegl). Worked example: signed in as `a@example.com`, opening an invite addressed to `b@example.com` shows that the invite is for `b@example.com` and that accepting switches the session to that account; accepting does exactly that.

## Notes

**claude** — 2026-08-17T04:00:39Z

Resolved: the page reads the invite preview call (contract on k7wegl) and, when a different account is signed in, states the invited email and that accepting switches the session to it - which the accept call then does. No silent switch, no blocked accept.

**agent** — 2026-08-28T20:59:57Z

Seam: the web app's pure modules (88v6vg / kjgubg). The page is a gate and a hand-off. Classifiable behaviour: status-to-sentence for a used/revoked/unknown invite (404) versus an expired one (410), and the session-switch notice when a different account is already signed in. Destination after accept is / — same as sign-in — and / sends a member to the product. Server-side gates and the whole-document navigation after the cookie changes stay unverified here, as the spec decided.

**agent** — 2026-08-29T06:10:05Z

The invite page is at /invites/{token}. Preview is GET /api/v1/invites/{token} (unauthenticated); the card shows the Workspace name and the offered Role before anything is spent. Accept is POST from the browser (Set-Cookie through the rewrite), then a whole-document navigation to /. A used/revoked/unknown invite (404) and an expired one (410) are different sentences; both offer sign-in. A visitor already signed in as someone else is told the invited email and that accepting replaces the session — accepting still proceeds.

Seam: web pure modules (88v6vg / kjgubg). Status-to-sentence in failures.ts; session-switch notice in invites.ts. Server-side gates and the navigation after the cookie changes stay unverified here, as the spec decided.
