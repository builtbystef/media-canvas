---
id: kjgubg
title: Decide the web app's test seam
state: todo
priority: high
parent: 88v6vg
created: 2026-08-18T10:37:31Z
updated: 2026-08-18T10:37:31Z
---

## What to build

`apps/web` has no test seam and no test infrastructure. The accounts spec (88v6vg) names two seams — the public HTTP API and the Mailer — and neither covers a page. jmpc8g shipped the first web pages under a user decision to verify them by hand and settle the seam here, deliberately, with the slices that follow in view.

The decision binds every later web slice: the settings area (hddsdp), the invite acceptance page (50gsoy), the shell and document list (hg52gb), and the editor.

## The options as they stood

- **Flow modules + vitest, no new dependency.** Keep the behaviour (step transitions, failure classification, where a signed-in person is sent) in plain TS modules over a fake api client, with React components as thin views. Uses the vitest already in the catalog, and honours the standing rule to prefer what the project has. Does not reach JSX wiring or the server-side gates.
- **Testing Library + jsdom.** Adds `@testing-library/react`, `@testing-library/dom`, and `jsdom` as web devDependencies, and tests the rendered pages — type an address, see the code step name it, submit a wrong code, read the message. Closest to how the criteria are written. Three dependencies the spec does not name.
- **A browser-driven seam.** Playwright is already the worker's engine under ADR-0002. Reuse would need a running stack, which no check currently assumes.

## Acceptance criteria

- [ ] One seam is chosen for `apps/web` and written down where the next slice will find it — the spec's Testing Decisions, or a note that amends it.
- [ ] Any dependency the choice adds is named with its reason, as `docs/CODING_STANDARDS.md` requires.
- [ ] The seam is proven on jmpc8g's pages rather than described: the sign-in flow, the failure states, and the routing decisions get their tests, so the slices that follow have a worked example to copy.
- [ ] `pnpm test` runs them.
