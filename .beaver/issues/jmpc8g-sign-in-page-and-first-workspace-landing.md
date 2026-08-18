---
id: jmpc8g
title: Sign-in page and first-Workspace landing
state: done
assignee: claude
priority: high
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:37Z
updated: 2026-08-18T10:38:25Z
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

## Notes

**claude** — 2026-08-18T10:38:21Z

Done. The web app has its first three pages, and signing in works end to end against the real stack.

**What landed.** `app/sign-in` is the two-step form (address, then code) and a server gate that sends a signed-in caller onward instead of showing it. `app/workspaces/new` creates a Workspace, wording itself as *your* first or *a* further one from the caller's memberships. `app/page.tsx` is the product's front door: signed out it goes to sign-in, with no Workspace it goes to creation, otherwise it names the Workspace and the Role and offers signing out. `lib/identity.ts` is the gate, `lib/routes.ts` the page names, `lib/failures.ts` the refusals in words. On the api side, `configure_logging()` in `main.py`.

**Decisions a reviewer should know.**

- *The gate is server-side, and it is one function.* `currentIdentity()` hands the request's whole cookie header to `GET /me` and believes the answer; `signedInOrSignIn()` redirects when there is none. Which cookie carries a session, and whether it is still good, stay the api's questions — the web app never learns the cookie's name. All three routes render dynamically (`ƒ` in the build output), which is what makes the redirect happen before anything is painted.
- *The browser calls the api through the Next rewrite, not from a server action.* Verifying a code answers with `Set-Cookie`, and it has to reach the browser that will carry it. Same-origin through the rewrite is also what a deployed stack does behind Caddy, so no CORS is involved in either place. Verified: the cookie survives the proxy hop.
- *Signing in and out are whole-document navigations* (`window.location.replace`), not `router.push`. The cookie has just changed and every page decides what to show from it on the server, so nothing client-side should be carried over — and replacing the entry keeps the page just left out of the history behind it.
- *Where to go after signing in is decided in one place.* Both forms navigate to `/`, and `/` sends people on. A second copy of that rule in the client would be a second thing to keep true.
- *The three refusals are told apart by status, and each names a next move*: 401 wrong digits (retry), 410 spent (the button relabels itself *Send a new code*), 429 too fast (wait a minute). `lib/failures.ts` is the only place a status becomes a sentence.

**Two things the criteria demanded that did not work, and now do.**

- *Criterion 7 was false before this issue.* uvicorn configures its own loggers and leaves the root alone, so `ConsoleMailer`'s `logger.info` reached no handler and the sign-in code was printed nowhere — the default driver, on a machine with no mail service, signed nobody in. `configure_logging()` gives the package logger a handler at INFO, with propagation left on so `caplog` and any deployment's own handlers still see the records. `tests/test_mailer.py` did not catch it because `caplog.at_level` sets the level itself.
- *Criterion 6 failed, twice, for two different reasons.* Going back after signing out re-showed the product. A browser re-displays a document it already has on a history navigation — from the back/forward cache, or from the http cache, and it does the latter even for a response that said not to store it. Nothing runs on the server, so the gate is never asked. `Cache-Control` is not the lever: Next writes its own header for a dynamic page over anything the config or a proxy sets. `app/recheck-on-restore.tsx` covers both ways back — `pageshow`'s `persisted` for a document restored whole, and a `back_forward` navigation type for one rebuilt from cache — and answers either with `router.refresh()`, which re-runs the route on the server, redirect included. Confirmed against a production build: back after signing out lands on sign-in, and the api log shows the `/me` that decided it.

**Testing.** None here, by the user's decision when asked: the spec names no web seam, no web test infrastructure exists, and choosing one binds hddsdp, 50gsoy, hg52gb, and the editor. That choice is now its own issue, **kjgubg**, which also owns writing this slice's tests once the seam exists. Verification was by hand against the running stack, at the HTTP seam and in a browser: signed-out redirects from both app pages; a code requested, read from the api log, and spent; 401 / 410 / 429 each seen on screen with its own wording; a first sign-in landing on Workspace creation and a later one landing in the product as Owner; a signed-in visit to `/sign-in` sent onward; sign-out leaving the session row gone, so that even replaying the old cookie is refused; and back, repeatedly, never revealing the app.

**Also out of scope, and published: etfqc7.** `next dev` writes `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` into the tree every time it runs. They are Next's, not ours, and the block instructs agents working under `apps/web`; committing vendor text that overrides this project's own instructions is not this issue's call, so they are left uncommitted.

**Checks.** `pnpm run ci` green: check, 63 TS tests + 64 api tests, build. `openapi.json` and the generated client are unchanged — no route changed. No new dependency.
