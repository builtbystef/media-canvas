---
id: ejy8hn
title: What is the v1 auth and API key model?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - jgo8tv
    - kjz6f0
    - 3ko2p7
parent: v1xa7j
created: 2026-08-14T20:36:05Z
updated: 2026-08-15T04:04:33Z
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

## Notes

**claude** — 2026-08-15T03:22:34Z

Node ex95f4 (deployment) closed first — you inherit its answers: production is a single origin behind Caddy (the only published port; / → web, /api + /assets + /jobs → api), exposure is the deployer's choice (portable stack, laptop or public box, DOMAIN env flips Let's Encrypt TLS), and secrets live in one root .env from a committed .env.example. Caddy is the one front door if auth sits at the proxy; the CORS * font carve-out (3ko2p7) is dev-only in production. Spec node n60ho8 (deployment and access) waits on this node.

**claude** — 2026-08-15T04:01:15Z

ANSWER (interview 2026-08-15). v1 auth is "SaaS minus billing": full multi-tenancy and RBAC, self-serve, no admin — reversing the roadmap's Out-of-scope line on multi-tenant features (user decision; billing, plans, quotas, and metering stay out). Recorded in ADR-0009; terms in the glossary's "Accounts & access" section.

IDENTITY — Email OTP is the only sign-in; no passwords, no reset flows. Email → 6-digit code via Resend (RESEND_API_KEY in .env; when unset, codes and invites print to the api log — localhost works with zero setup). Codes: 10-min expiry, single-use, max 5 verify attempts, rate-limited per email (1/30s, 10/hour). Signup IS sign-in: first successful verification creates the User. Registration is truly open — no allowlist, no guard env; restricting a remote instance is the self-hoster's job at the network layer (proxy/IP rules), outside the app.

SESSIONS — Postgres table (id, user_id, expiry), HTTP-only cookie, 30-day rolling expiry, POST /logout deletes the row. No Instance Admin, no seed command, no admin revocation.

WORKSPACES & RBAC — Workspace = tenant, owns documents, assets, jobs. First sign-in lands on "create your workspace"; any User creates workspaces and is Owner of what they create. Roles per Membership: Owner (members, invites, API keys, the workspace itself), Editor (content + generation), Viewer (read/download). Workspace Invite: Owner-sent email carrying a Role, single-use; a new email's invite doubles as signup.

API KEYS — Workspace-owned, Owner-managed, named; SHA-256 hash at rest + prefix for display, plaintext shown once; header `Authorization: Bearer mc_...`. Editor-equivalent on the generation surface only (render, jobs, outputs) — never member/key/workspace management (cookie + Owner only). No scopes/per-key roles in v1.

ENFORCEMENT — Every route needs session cookie or API key except: OTP request/verify, invite acceptance, /health. Job output URLs and the zip are authenticated (jgo8tv's "scriptable retrieval" = with a key in the header). The 3ko2p7 CORS * font carve-out DIES: asset bytes authenticated everywhere; production is same-origin behind Caddy so fonts just work; dev uses credentialed CORS pinned to the editor origin (SameSite=Lax cookie).

TENANCY RIPPLE (amendments to published specs — tracked by the follow-up task node): workspace_id on documents, image_assets, font_assets, generation_jobs; asset identity becomes (workspace_id, hash) — same bytes in two workspaces are two assets, and 3ko2p7's "re-upload revives references" holds per-workspace only; storage keys gain a workspace scope; collection/create routes become workspace-scoped (/api/v1/workspaces/{wsId}/...; batch jobs stay under templates/{id}/jobs), item routes stay id-based with membership (or key-workspace) checks; the web app gets a workspace switcher; 9eooei's no-pagination rule survives as per-workspace lists.

REASON — the user's goal is to be "most of the way to a hosted SaaS" while self-hosting first: tenancy and RBAC are the architecture, billing is just a wall added later. OTP-plus-Resend deletes password storage, reset flows, and out-of-band invite links at the cost of one external service for new logins (accepted; 30-day sessions bound the blast radius, log fallback covers dev/offline).

**claude** — 2026-08-15T04:04:33Z

AMENDMENT (user, 2026-08-15): email delivery goes through a Mailer seam instead of hard-wiring Resend. One api-side (FastAPI) interface, exactly two message kinds (OTP code, Workspace Invite), three drivers selected by a MAILER env var: console (default — prints to the api log; the dev fallback already settled), resend (requires RESEND_API_KEY), smtp (requires SMTP_HOST/PORT/USER/PASSWORD — keeps a self-hosted stack fully self-contained with no external SaaS in the sign-in path). Shared EMAIL_FROM for the real drivers. Everything else in the answer stands; ADR-0009 updated to match.
