---
id: 5wbz53
title: A browser smoke suite for the paths only a browser can see
state: todo
priority: medium
depends_on:
    - ex95f4
parent: 88v6vg
created: 2026-08-18T22:50:15Z
updated: 2026-08-19T11:28:58Z
---

## What to build

A handful of end-to-end paths, run in a real browser against a real stack. Not a pyramid, and not a second home for behaviour that already has a seam: only the things the other two seams structurally cannot observe.

The web app's own seam is its pure modules (the kjgubg decision, amended into 88v6vg). That seam has no DOM, no history, and no cookie jar, so three kinds of behaviour in `apps/web` are verified by hand today and stay unverified between slices: the server-side redirect gates, the whole-document navigations taken after the session cookie changes, and the back/forward-cache recheck.

The last of those is the reason this issue exists rather than waiting. `app/recheck-on-restore.tsx` is the fix for jmpc8g's real defect — going back after signing out re-showed the product — and it rests on a `useEffect`, the navigation-timing API, and a Next behaviour that a version bump could each shift. Its failure mode is silent, and a person stops re-checking the back button after the third slice.

This becomes cheap once ex95f4 lands the `app` compose profile: one command brings up the whole product at a single origin, which is what these paths need.

## Acceptance criteria

- [ ] A signed-out visitor reaching an app page arrives at sign-in, for both `/` and `/workspaces/new`.
- [ ] Signing in end to end works against the running stack: a code is requested, read where the console Mailer puts it, and spent, and the visitor lands in the product — or in Workspace creation when they have no Workspace.
- [ ] Signing out and then going back does not reveal the product. Worked example: sign in, reach the product, sign out, press back — sign-in is shown, and the api log carries the `/me` that decided it.
- [ ] A signed-in visitor reaching `/sign-in` is sent onward rather than shown the form.
- [ ] Following an invite link lands the recipient in the product in one step (once 50gsoy exists; drop this path if it does not yet).
- [ ] The engine and how it is run are written down, including whether it runs in CI or on demand — no check currently assumes a running stack, and this one does.
- [ ] The suite stays roughly this size. Anything a pure module could have answered belongs at the module seam instead.

## Notes

The engine is an open question this issue decides, not one already settled. ADR-0002 pins Playwright and a Chromium build inside the render worker's image for output fidelity; that pin exists for a different purpose, and reusing the dependency should not mean coupling this suite to it.

**claude** — 2026-08-19T11:28:58Z

hg52gb adds paths this suite should cover, and it is the second slice whose client-side gestures no check can see: the Workspace switcher writing its cookie and the list coming back for another Workspace, the creation dialog creating a design and landing in the editor, the delete confirm, promote leaving both rows in the list, and the top bar's rename committing on blur and on Enter. The pure parts are unit-tested (the cookie string, the presets, the document a preset creates, the refusal wording) and the server-rendered parts were verified against a stood-in api; what stays unseen is the browser between them.
