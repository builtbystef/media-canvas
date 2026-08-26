---
id: t3n0fj
title: Workspace API keys
state: done
assignee: agent
priority: medium
depends_on:
    - sazdn4
parent: 88v6vg
created: 2026-08-15T06:22:20Z
updated: 2026-08-26T19:18:27Z
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

## Notes

**agent** — 2026-08-26T19:18:27Z

Done. Workspace API keys are in the api. The settings panel is y0dxtu; authenticating the real generation routes is lgqvg9, as the last criterion says.

**What landed.** `models.py` gains `ApiKey` with migration `0009_api_keys` (FK cascade from workspaces). `keys.py` is the domain: mint, list, revoke, authenticate, record last use. `api_keys.py` is the router: POST/GET `/workspaces/{workspaceId}/api-keys`, DELETE `.../{apiKeyId}`. Create answers `{id, name, prefix, key}`; list answers name, prefix, timestamps — never the secret. `access.py` accepts `Authorization: Bearer mc_...`, treats a valid key as Editor of its Workspace via `requiring()`, and refuses every shipped route (generation surface is empty until lgqvg9). A revoked or unknown key is 401.

**Decisions a reviewer should know.**

- *The plaintext is `mc_` + `token_urlsafe(32)`.* Same 256-bit construction as a session token; the prefix is the first eight characters after `mc_`; SHA-256 at rest via the existing `hash_token`.
- *A key is not a member.* `requiring()` synthesises an in-memory Membership with Role.editor so the same ladder refuses Owner-only routes. The object is never persisted. `user_id` is the key's id only because the column is required; nothing reads it.
- *Generation surface is a predicate on `app.state`.* The default is refuse-all. lgqvg9 replaces it with the real paths and will need `holding()` / `holding_job()` to accept a key the same way `requiring()` now does. Tests that need the permitted case mount a probe and set the predicate.
- *Last use is best-effort.* Recorded on any request that presented a valid key, including ones then refused with 403. A failure rolls the request session back and the request continues.
- *Bearer `mc_...` wins over a cookie.* A script that sends the header is a key, even if a leftover cookie is also present.

**Testing.** Spec seam 1 — the public HTTP API against a real Postgres. `tests/test_keys.py` carries the six behavioural criteria. Criterion 3 (Editor-equivalent identity) is a test-mounted pair of probes on a generation-surface predicate, the same pattern as `test_access.py`, because no shipped route is generation surface yet.

**Checks.** `pnpm check` green. 181 api tests + 382 TS tests. `openapi.json` and the generated client regenerated. `pnpm build`'s web step failed in this sandbox (Google Fonts unreachable); api export and client generation succeeded.
