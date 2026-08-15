---
id: 50gsoy
title: The invite acceptance page
state: todo
priority: medium
depends_on:
    - k7wegl
    - jmpc8g
parent: 88v6vg
created: 2026-08-15T06:22:46Z
updated: 2026-08-15T06:22:46Z
---

## What to build

The page at the end of an invite email. The recipient clicks the link, sees which Workspace they are being invited to and as what, accepts, and is signed in and inside — whether or not they had an account a moment earlier.

## Acceptance criteria

- [ ] Following an invite link shows the Workspace name and the offered Role before anything is accepted.
- [ ] Accepting signs the visitor in and lands them in that Workspace, with no separate sign-in step. Worked example: a recipient who has never used the instance goes from the email link to the product in one click.
- [ ] A link that was already used, revoked, or never existed shows a clear message and a way to the sign-in page — not a blank error.
- [ ] An expired link says so specifically, and tells the recipient to ask the Owner for a new invite.
- [ ] A visitor who is already signed in as a different person is not silently switched: the page makes clear whose account the invite will attach to before it is accepted.
