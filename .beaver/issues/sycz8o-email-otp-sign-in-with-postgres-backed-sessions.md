---
id: sycz8o
title: Email OTP sign-in with Postgres-backed sessions
state: todo
priority: high
depends_on:
    - ilgj60
parent: 88v6vg
created: 2026-08-15T06:21:51Z
updated: 2026-08-15T06:21:51Z
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
- [ ] Every route requires a session except requesting a code, verifying a code, and health. Worked examples: `/me` with no cookie → 401; `/me` with a cookie whose session was deleted → 401.
- [ ] Expired sessions and codes are removed when next touched; nothing scheduled sweeps them.
- [ ] The Mailer is one interface with exactly two messages — the sign-in code and the Workspace Invite — with a console driver that prints them to the api log as the default, and a recording fake that the tests assert against.
- [ ] The web app's development origin can sign in cross-origin with credentials; in production, where everything is served from one origin, no cross-origin headers are sent.
