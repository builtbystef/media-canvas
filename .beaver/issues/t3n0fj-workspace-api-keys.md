---
id: t3n0fj
title: Workspace API keys
state: todo
priority: medium
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:20Z
updated: 2026-08-15T06:22:20Z
---

## What to build

An Owner mints a key that scripts and automation use instead of a browser session. The plaintext key is shown exactly once, at creation; afterwards only its name and a short prefix identify it in the list. A key belongs to one Workspace and carries Editor-equivalent rights there, but only over the generation surface — it is never a way around the settings pages.

## Acceptance criteria

- [ ] An Owner creates a key with a name and receives the plaintext value exactly once, in that response. Worked example: the key reads `mc_` followed by random characters; listing keys afterwards returns the name, the first eight characters after `mc_`, and the timestamps — never the key itself.
- [ ] Only its hash is stored, and only Owners create, list, and revoke keys. Worked example: an Editor calling the key endpoints → 403.
- [ ] A valid key authenticates a request as an Editor of the key's Workspace. Worked example: the caller resolved from a key is refused by an Owner-only route and permitted by an Editor-level one.
- [ ] A key is refused on any route outside the generation surface, with 403 — including every accounts route. Worked example: listing members with a valid key → 403, while the same call with the Owner's cookie → 200.
- [ ] A revoked or unknown key answers 401. Worked example: a key that worked a moment ago, deleted, then reused → 401.
- [ ] Last use is recorded on a best-effort basis and never fails the request it belongs to.
- [ ] Proving the permitted case end to end waits for the generation routes, which are tracked as their own issue.
