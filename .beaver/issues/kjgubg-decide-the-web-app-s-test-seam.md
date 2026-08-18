---
id: kjgubg
title: Decide the web app's test seam
state: done
assignee: claude
priority: high
parent: 88v6vg
created: 2026-08-18T10:37:31Z
updated: 2026-08-18T22:50:33Z
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

## Notes

**claude** — 2026-08-18T22:50:33Z

Done. The web app's seam is its pure modules, at the vitest run this repo already has — no DOM, no component harness.

**The decision, and where it lives.** Amended into 88v6vg's Testing Decisions as a third seam, with the two rejected options and their reasons, so the question stays closed. The rule that travels with it: behaviour worth testing is extracted into a module and tested there, rather than reached through a rendered tree — a page stays a gate and a hand-off, and the editor's canvas logic goes to packages/core under ADR-0003.

**Why not jsdom, in one line.** Every rule with teeth is enforced by the api and covered at seam 1; what is left in apps/web is a status-to-sentence table, three route constants, one pure decision, and useState. And the one real web defect this project has hit — jmpc8g's back-after-sign-out — is invisible to jsdom too, so a component harness would have bought the appearance of coverage over exactly the paths that broke.

**Dependencies.** None new to the project. `apps/web` declares `vitest: catalog:`, the same entry packages/core and packages/fonts already carry; the typecheck required it once test files existed in that package.

**What landed.** `apps/web/lib/failures.test.ts` (6 tests) and `apps/web/lib/identity.test.ts` (2). They cover jmpc8g's classifiable behaviour: the three sign-in refusals stay distinct and each names its next move, a spent code is the only one worth asking again for, an unrecognised or absent status falls back to unreachable on all three calls, a refusal one call knows is not borrowed by another, and a signed-in person goes to the product or to Workspace creation by their memberships. The destination is asserted as the literal page paths, so rewiring a route constant fails here rather than in a browser.

No production code changed. `lib/identity.ts` imports cleanly in the node environment despite `next/headers`, so `destinationFor` needed no extraction.

**Mutation-checked rather than assumed.** Flipping `memberships.length > 0` to `>= 0`, and pointing the 410 message at the 401 wording, each turned a test red; both were reverted.

**Deliberately not covered, and said so in the amendment:** the server-side redirect gates, the whole-document navigations after a cookie change, and the back/forward-cache recheck. Those are now **5wbz53** — a browser smoke suite of about five paths, blocked on ex95f4's `app` compose profile, with the recheck's silent failure mode named as its reason.

**Checks.** `pnpm check` green. `pnpm test` green: 71 TS tests (was 63) and 64 api tests. No route changed, so openapi.json and the generated client are untouched.
