---
id: sycz8o
title: Email OTP sign-in with Postgres-backed sessions
state: done
assignee: claude
priority: high
depends_on:
    - ilgj60
parent: 88v6vg
created: 2026-08-15T06:21:51Z
updated: 2026-08-18T08:15:00Z
---

## What to build

Anyone with an email address signs in by asking for a code, reading the six digits out of their inbox (or, in development, out of the api log), and typing them back. No password exists anywhere in the product. A successful verification creates the User if the email is new and returns the session cookie that every other route will demand from then on.

## Acceptance criteria

- [ ] Requesting a code always answers 204, whether or not that email has an account, so the endpoint discloses nothing about who is registered.
- [ ] Codes are six digits, expire after 10 minutes, are single-use, and are stored hashed. Worked example: the recording Mailer captures a six-digit code; verifying with it answers 204 and sets a session cookie; verifying with the same code again answers 410.
- [ ] A code allows at most five verification attempts. Worked example: five wrong attempts followed by the correct code → 410; requesting a fresh code and verifying with it → 204.
- [ ] Per-email rate limits of one request per 30 seconds and ten per hour are enforced from the database — Redis is not involved. Worked example: the eleventh request within an hour → 429.
- [ ] The first successful verification for an unknown email creates the User, with the email stored lowercased. Worked example: verifying as `Alice@Example.COM` and later as `alice@example.com` reaches the same User.
- [ ] The session cookie carries an opaque random token, HTTP-only and SameSite=Lax; only its hash is stored. Its expiry rolls 30 days forward when the session is used, and that write happens at most once a day per session.
- [ ] `GET /me` returns the signed-in User together with its memberships (an empty list until Workspaces exist). Logging out deletes the session, after which the same cookie answers 401.
- [ ] Every route requires a session except requesting a code, verifying a code, and health — plus, once invites exist, previewing and accepting an invite (k7wegl widens the list; nothing else ever joins it). Worked examples: `/me` with no cookie → 401; `/me` with a cookie whose session was deleted → 401.
- [ ] Expired sessions and codes are removed when next touched; nothing scheduled sweeps them.
- [ ] The Mailer is one interface with exactly two messages — the sign-in code and the Workspace Invite — with a console driver that prints them to the api log as the default, and a recording fake that the tests assert against.
- [ ] The web app's development origin can sign in cross-origin with credentials; in production, where everything is served from one origin, no cross-origin headers are sent.

## Notes

**claude** — 2026-08-18T08:15:00Z

Done. Email OTP sign-in and Postgres-backed sessions are in the api; the web side is jmpc8g, and the real Mailer drivers are 22bvk7.

**What landed.** `models.py` (users, sessions, otp_codes) with migration `0002_accounts`; `otp.py` (issue, verify, both rate limits); `sessions.py` (start, authenticate, roll, end, cookie); `users.py` (find-or-create, lowercased); `mailer.py` (the interface, the console driver, the recording fake); `access.py` (default-deny middleware, the request's database session, cross-origin handling); `auth.py` (the four routes); `clock.py` (the time seam). `.env.example` gains DOMAIN and PUBLIC_URL.

**Decisions a reviewer should know.**

- *Default-deny is middleware over an explicit path list, not a route marker.* The first attempt marked endpoints with a `@public` decorator and resolved the matched route in the middleware; this FastAPI version no longer flattens included routers into `app.routes` (it keeps an internal `_IncludedRouter`), so resolving a route outside the router means reaching into framework internals. `PUBLIC_PATHS` in `access.py` is instead the literal list the spec states. Everything absent from it needs a session, the interactive documentation and `/openapi.json` included — sign in and the browser sends the cookie. k7wegl adds invite preview and accept, and will need pattern matching for the `{token}` segment.
- *Authentication happens once, in the middleware, and the handlers read the result.* The same middleware opens the one database session a request works in (`request.state.database`), so a route can neither repeat the lookup nor forget it.
- *The session cookie is refreshed when the row rolls.* The criterion names the row's expiry, but a cookie issued with a 30-day lifetime would log a rolling session out on day 30 anyway. The middleware adds one `Set-Cookie` on exactly the requests that rolled — no extra write, and it makes "at most once a day" observable at the HTTP seam.
- *An OTP row outlives its code by design.* A code dies at ten minutes; its `created_at` still counts towards the hourly limit for an hour, so that hour is the horizon at which the row is deleted. Removal is still lazy — it happens when the address is next touched, and nothing is scheduled.
- *Dev versus production is derived, not configured.* No new mode flag: cross-origin headers are sent exactly when the derived public base URL is still the dev editor origin, i.e. when neither DOMAIN nor PUBLIC_URL is set, and they are pinned to that origin with credentials. The same derivation sets the cookie's Secure flag. A deployment always sets one of the two and therefore sends no cross-origin headers at all.
- *No MAILER environment variable yet.* The app constructs the console driver, which is this issue's "console driver as the default". Selecting a driver by environment variable, and failing startup on a bad one, is 22bvk7's first criterion and is left there.
- *A code's digest binds the address* (`sha256("{email}:{code}")`), so the column is not a lookup table of the million possible six-digit hashes. Session tokens are `secrets.token_urlsafe(32)` stored as SHA-256. Both stdlib — no new dependency anywhere in this issue.
- *No email-format validation.* No criterion asks for it and `email-validator` would be a new dependency; addresses are trimmed, lowercased, and length-capped at 320.

**Seams.** The spec named two — the public HTTP API and the Mailer — and both carry the bulk of the tests. Two claims are not observable at either: that codes and session tokens are never stored in the clear, and that expired rows are actually deleted. `tests/test_storage.py` drives those through the public api and reads the tables, because the tables are the only place the claim exists.

**For jmpc8g.** The generated api-client must send credentials (`credentials: "include"`) for cross-origin dev sign-in to work; the api side of it is done.

**Checks.** `pnpm run ci` green: check, 35 api tests + 20 TS tests, build. `openapi.json` and the generated client are regenerated and committed.
