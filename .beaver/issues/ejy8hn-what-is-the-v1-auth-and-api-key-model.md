---
id: ejy8hn
title: What is the v1 auth and API key model?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - jgo8tv
    - kjz6f0
    - 3ko2p7
parent: v1xa7j
created: 2026-08-14T20:36:05Z
updated: 2026-08-14T20:36:05Z
---

Settle how the "me first, product later" constraint translates into a concrete auth and API key model — pulled into v1 by the user (2026-08-14) instead of staying deferred on the Frontier.

Interview the user (grill-me skill, limited to this question). Settle at least:

- Whether v1 has a login at all (single user, self-hosted): browser session mechanics — app-level session cookie, a single shared secret, or auth at a reverse proxy — and how the Next.js editor authenticates to FastAPI.
- API keys for the generation API: the contract jgo8tv is auth-agnostic and keys bolt onto it. Issuance and revocation flow, storage (hashed?), header scheme, and whether v1 has one all-powerful key or scoped keys.
- The enforcement point: node kjz6f0 proxies every file URL through FastAPI so auth has one place to live — which routes require auth and which stay open.
- The font/CORS constraint from node 3ko2p7: v1 serves asset bytes unauthenticated with `Access-Control-Allow-Origin: *` because `@font-face` requires cross-origin fetches from the editor's origin. Does that carve-out survive, or does auth cover asset bytes too — and if so, how do font fetches keep working?
- What stays designed-but-not-built for productizing (accounts table, tenancy, per-user keys) — the boundary between v1 auth and the accounts-era model.

Coordinate with node ex95f4 (v1 self-hosted deployment): exposure — localhost-only, LAN, or public VPS — sets the threat model, and a reverse proxy chosen there could carry auth. Whichever session runs first, the other inherits its answers.

Pointers: the former root Frontier entry "Auth and API keys"; notes of jgo8tv, kjz6f0, 3ko2p7; spec 0egsmf (internal service auth via INTERNAL_API_TOKEN is already settled — this node is only the public surface).
