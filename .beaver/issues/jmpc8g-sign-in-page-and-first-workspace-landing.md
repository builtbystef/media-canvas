---
id: jmpc8g
title: Sign-in page and first-Workspace landing
state: todo
priority: high
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:37Z
updated: 2026-08-15T06:22:37Z
---

## What to build

The first screen of the product: a person types their email, receives a code, types it back, and is inside. Someone signing in for the first time has no Workspace, so they land on a screen that asks for a name and creates one — and from there they are in a working product with no administrator involved anywhere.

## Acceptance criteria

- [ ] The sign-in page takes an email address, requests a code, and moves to a code-entry step that names the address the code went to and offers a way back to correct it.
- [ ] Entering the correct code signs the person in and takes them onward: to their workspace when they have one, to Workspace creation when they have none.
- [ ] The failure states are distinguishable on screen: a wrong code, a code that has expired or been used up, and too many requests too quickly — each with what to do next (retry, request a new code, wait).
- [ ] A signed-in person reaching the sign-in page is sent onward rather than being asked to sign in again; a signed-out person reaching an app page is sent to sign-in.
- [ ] The Workspace creation screen takes a name, creates the Workspace, and lands the person in the product as its Owner.
- [ ] Signing out returns to the sign-in page and leaves no session behind — going back in the browser does not reveal the signed-in app.
- [ ] In development, the code printed in the api log is enough to sign in, with no mail service configured.
