---
id: 88v6vg
title: Deployment and access
state: todo
labels:
    - spec
depends_on:
    - ex95f4
    - ejy8hn
    - u2ovlu
created: 2026-08-15T04:37:51Z
updated: 2026-08-18T22:49:56Z
---

## Problem Statement

Media Canvas is settled as a multi-tenant "SaaS minus billing" (ADR-0009) that self-hosts as a portable compose stack — but neither half is buildable yet. There is no specification of how the stack runs in production (services, entry point, TLS, config, persistence, upgrades), and no specification of the accounts surface (sign-in, Workspaces, Memberships, Invites, API keys) or of how every existing route enforces the new auth model. The four published specs were amended for tenancy but delegate the accounts surface and the deployment topology here.

## Solution

One root compose file runs the whole product: the default profile brings up infra only (unchanged dev behavior), and an `app` profile adds the api, the web app, the pinned render worker, and Caddy — the single published origin, with a `DOMAIN` flag that flips automatic HTTPS. The repo is the distribution: clone, copy `.env.example` to `.env`, `docker compose --profile app up -d --build`.

Access is email-OTP sign-in through a Mailer seam (console/resend/smtp drivers), Postgres-backed sessions in an HTTP-only cookie, self-serve Workspaces with per-Membership Roles (Owner/Editor/Viewer), Owner-sent single-use Workspace Invites, and Workspace-owned API keys that are Editor-equivalent on the generation surface only. Every route requires a session cookie or API key except OTP request/verify, invite acceptance, and health.

## User Stories

1. As a deployer, I want to bring up the full stack with one compose command and a copied `.env`, so that a laptop or a rented box runs the same product.
2. As a deployer, I want setting `DOMAIN` to be the only step for HTTPS, so that TLS never needs manual certificate work.
3. As a deployer, I want a documented manual backup and restore procedure, so that Postgres and the object store survive a host move.
4. As a person with an email address, I want to sign in with a one-time code, so that no password ever exists.
5. As a new User, I want my first sign-in to land me in Workspace creation, so that I reach a working editor without an admin.
6. As an Owner, I want to invite an email with a Role, so that collaborators (or my other identity) join my Workspace self-serve.
7. As an Owner, I want to manage members, pending invites, and API keys in a settings page, so that access control needs no CLI.
8. As an Editor via API key, I want to script rendering and batch generation, so that automation never needs my cookie.
9. As a Viewer, I want to browse and download but never mutate, so that sharing read access is safe.

## Implementation Decisions

### Compose topology

- One root `docker-compose.yml` with profiles. Default profile: infra only — `postgres:17`, `redis:8`, `dxflrs/garage:v2.3.0`, ports bound to localhost, named volumes, healthchecks (kjz6f0's dev behavior unchanged, with Garage in MinIO's place per jl1ew8). Profile `app` adds: `api`, `web`, `worker`, `caddy`, all `restart: unless-stopped`.
- `api` entrypoint runs `alembic upgrade head` before serving; `git pull && docker compose --profile app up -d --build` is the whole upgrade.
- `worker` is the ADR-0002 pinned-Chromium image, one replica, internal concurrency 8. Its Dockerfile is the single home of the Chromium + fontconfig pin (goldens, CI, production).
- Images build from the repo's Dockerfiles (`build:` sections); version identity is the git commit. No registry.
- Caddy is the only service publishing ports. `DOMAIN` set → 80 + 443 with automatic Let's Encrypt (80 serves ACME + redirect); unset → HTTP only on `HTTP_PORT` (default 80). Routes: `/api`, `/assets`, `/jobs` → api; everything else → web.
- Named volumes: postgres, garage, caddy (cert storage). Garage keeps metadata and data as two directories under `/var/lib/garage`, so one volume mounted there covers both. Garage also needs its committed config file (`infra/garage.toml`) bind-mounted read-only at `/etc/garage.toml`; it refuses to start without one.

### Config

`.env.example` (committed; copied to gitignored `.env`; secrets via `openssl rand -hex 32`):

```
POSTGRES_PASSWORD=            # required
GARAGE_DEFAULT_ACCESS_KEY=    # required
GARAGE_DEFAULT_SECRET_KEY=    # required — Garage rejects fewer than 16 characters
GARAGE_RPC_SECRET=            # required — mandatory even on a single node
INTERNAL_API_TOKEN=           # required
DOMAIN=                       # optional — set to enable HTTPS
HTTP_PORT=80                  # optional — HTTP-only port when DOMAIN unset
PUBLIC_URL=                   # optional — absolute base for email links
MAILER=console                # console | resend | smtp
RESEND_API_KEY=               # required when MAILER=resend
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASSWORD=   # required when MAILER=smtp
EMAIL_FROM=                   # required for resend and smtp
```

The two `GARAGE_DEFAULT_*` values are one credential read from both ends: Garage mints the access key from them at first boot, and the api and worker authenticate with them over the S3 API. The bucket is not among them — the api creates and names its own buckets (0egsmf), so the name lives only in the api's own S3 configuration (92zwes).

No session-signing secret exists: session and invite tokens are opaque random values, hashed at rest. Email-link base URL derivation: `https://{DOMAIN}` when set, else `PUBLIC_URL`, else `http://localhost:3000` (the dev editor origin).

### Schema (all owned by FastAPI/Alembic, ADR-0005)

- `users`: id UUID PK, email unique (stored lowercased), created_at.
- `sessions`: id UUID PK, token_hash unique, user_id FK, created_at, expires_at. Cookie carries an opaque 256-bit token; row stores its SHA-256. Rolling 30-day expiry — `expires_at` is pushed forward on authenticated requests, written at most once per day per session.
- `otp_codes`: id, email, code_hash, attempts int, expires_at, consumed_at nullable, created_at. 6-digit code, 10-min expiry, single-use, max 5 verify attempts. Rate limits (1/30s and 10/hour per email) are derived from `created_at` counts — Postgres only; Redis stays a work signal (ADR-0004).
- `workspaces`: id UUID PK, name, created_at.
- `memberships`: PK (workspace_id, user_id), role enum (owner|editor|viewer), created_at.
- `invites`: id UUID PK, workspace_id FK, email, role, token_hash unique, expires_at (7 days), created_at. One pending invite per (workspace_id, email) — re-inviting replaces it.
- `api_keys`: id UUID PK, workspace_id FK, name, key_hash unique, prefix, created_at, last_used_at nullable (best-effort update).

### Accounts API surface (public, `/api/v1`)

```
POST /auth/otp/request  {email}        → 204 always (no user enumeration); 429 over rate limit
POST /auth/otp/verify   {email, code}  → 204 + Set-Cookie (HTTP-only, SameSite=Lax); creates the User on first success
                                         401 wrong code; 410 expired/consumed/attempts-exhausted
POST /auth/logout                      → 204, deletes the session row
GET  /me                               → { user: {id, email}, memberships: [{workspace: {id, name}, role}] }

POST   /workspaces            {name}   → Workspace; caller becomes Owner
PATCH  /workspaces/{wsId}     {name}   → Owner
DELETE /workspaces/{wsId}              → Owner; hard cascade (below)

GET    /workspaces/{wsId}/members                    → any member (list is member-visible; mutation Owner-only)
PATCH  /workspaces/{wsId}/members/{userId}  {role}   → Owner; 409 if it would demote the last Owner
DELETE /workspaces/{wsId}/members/{userId}           → Owner; 409 on the last Owner
POST   /workspaces/{wsId}/leave                      → any member; 409 if caller is the last Owner

POST   /workspaces/{wsId}/invites  {email, role}     → Owner; replaces a pending invite for that email; sends mail
GET    /workspaces/{wsId}/invites                    → Owner (pending only)
DELETE /workspaces/{wsId}/invites/{id}               → Owner (revoke)
POST   /invites/{token}/accept                       → unauthenticated; creates User if the email is new,
                                                       creates the Membership, signs the caller in (Set-Cookie);
                                                       404 unknown/used, 410 expired

POST   /workspaces/{wsId}/api-keys  {name}  → Owner; { id, name, prefix, key }  — plaintext key exactly once
GET    /workspaces/{wsId}/api-keys          → Owner; [{ id, name, prefix, created_at, last_used_at }]
DELETE /workspaces/{wsId}/api-keys/{id}     → Owner (revoke)

GET /api/health → 200, unauthenticated (covered by the existing Caddy map; no extra entry)
```

Key format: `mc_` + 256-bit random; `prefix` is the first 8 characters after `mc_`; SHA-256 at rest.

### Enforcement

- Every route requires a session cookie or `Authorization: Bearer mc_...` except: OTP request/verify, invite acceptance, `/api/health`.
- API keys authenticate only the generation surface (sync render, job submission/polling/cancel/delete, per-Row outputs, the zip), Editor-equivalent, scoped to the key's Workspace; a key on any other route → 403. Cookies work everywhere, gated by the caller's Role in the record's Workspace.
- RBAC: Viewer reads/downloads; Editor additionally mutates content and runs generation; Owner additionally manages members, invites, API keys, and the Workspace itself.
- Asset serving is `GET /assets/{wsId}/{hash}` (the Workspace is half the asset's identity); job outputs stay `GET /jobs/{jobId}/outputs/{name}` + zip, id-based. All authenticated, `Cache-Control: private, immutable`. Production is same-origin behind Caddy (no CORS headers); dev uses credentialed CORS pinned to the editor origin. The 3ko2p7 `*` carve-out is deleted.
- Internal contracts unchanged: `INTERNAL_API_TOKEN` bearer on `/internal/*` and the worker's HTTP service, both directions.

### Workspace delete cascade

Owner-only, explicit confirm in the UI. Hard cascade: Postgres rows first (FK cascade from `workspaces`), then the Workspace's object-storage prefixes (assets and `{wsId}/jobs/...`). A crash between the two leaves orphaned objects — accepted, same as 3ko2p7 (Frontier sweeper). Mid-render Rows of a deleted Workspace: the worker's result report hits a deleted row → 404 → the worker acknowledges and moves on; no new state.

### Mailer seam

One api-side interface, exactly two message kinds; driver selected by `MAILER` at startup:

```python
class Mailer(Protocol):
    def send_otp(self, to: str, code: str) -> None: ...
    def send_invite(self, to: str, workspace_name: str, role: str, accept_url: str) -> None: ...
```

`console` (default) prints both to the api log. `resend` uses the official Resend Python SDK. `smtp` uses stdlib `smtplib` over `SMTP_*`. `EMAIL_FROM` shared by the real drivers. `accept_url` is built from the base-URL derivation above; the acceptance page lives at `/invites/{token}` on the web app.

### Web app surface (this spec's pages)

Sign-in page (email → code entry), first-sign-in "create your Workspace" landing, invite-acceptance page, and a Workspace settings area with three panels: members (role change/remove/leave), pending invites (send/revoke), API keys (create with one-time plaintext reveal, revoke). The Workspace switcher itself belongs to the editor/asset spec (ek7pq1).

### Bundled fonts (confirmation)

Per-Workspace seeding at Workspace creation (idempotent), as amended into ek7pq1 and already user-reviewed — confirmed here; nothing new surfaced.

## Dependencies

- **Caddy** (container, `app` profile) — single-origin entry and zero-config Let's Encrypt TLS; settled by ex95f4.
- **Resend Python SDK** (api) — the `resend` Mailer driver; the official client for the settled provider.
- Nothing else: OTP/token generation is stdlib `secrets`, hashing is stdlib `hashlib`, the smtp driver is stdlib `smtplib`.

## Testing Decisions

Two seams, agreed with the user in the n60ho8 session:

1. **The public HTTP API** — all auth, accounts, RBAC, and enforcement behavior, tested with a real Postgres and a fake Mailer. Worked examples:
   - request OTP → fake Mailer captured `send_otp` with a 6-digit code → verify → `Set-Cookie` → `GET /me` returns the User.
   - verify with the wrong code 5 times → 6th attempt 410 even with the right code; a fresh request issues a new code.
   - 11th OTP request within an hour → 429.
   - Owner invites `x@y.z` as Editor → fake Mailer captured `accept_url` containing the derived base URL → accept unauthenticated → 204 + cookie, `/me` shows the Membership; accepting again → 404; accepting after 7 days → 410.
   - sole Owner calls leave → 409; after promoting a second Owner → 204.
   - API key: `POST /documents/{id}/render` with `Bearer mc_...` → 200; `GET /workspaces/{wsId}/members` with the same key → 403; after key deletion → 401.
   - Viewer cookie: `PUT /documents/{id}` → 403; `GET /assets/{wsId}/{hash}` → 200; no cookie → 401.
   - Workspace delete → its documents 404, its asset objects gone from storage.
2. **The Mailer interface** — a recording fake for API tests; each real driver gets at most a thin construction/config test. Driver internals are not unit-tested against live services.

Deployment carries no test seam: `docs/DEPLOYMENT.md` is the verification procedure, plus a `docker compose config` validity check in CI. Prior art: none — this spec lands the first application code paths for auth; the generation-platform spec's HTTP-seam testing style applies.

## Out of Scope

- Billing, plans, quotas, metering (ADR-0009); OAuth/SSO; scoped or per-role API keys; session-management UI (listing/revoking other sessions — v1 has only logout); webhooks (all Frontier).
- Password auth, instance admin/seed, in-app signup allowlist (settled exclusions).
- Registry-published images, a packaged installer, a separate production compose file, host-owned TLS, a secret manager, scheduled backups (ex95f4 exclusions).
- Changing a User's email address, and deleting a User account — excluded from v1 (user-confirmed in the n60ho8 interview) rather than invented.
- The orphaned-object sweeper (Frontier).

## Further Notes

- `docs/DEPLOYMENT.md` outline: prerequisites (docker, a box, optionally a DNS record) → first deploy (clone, `.env`, compose up, sign in, create Workspace) → upgrade (`git pull`, compose up --build) → backup (pg_dump via compose exec + a copy of the Garage volume, both `meta/` and `data/`, taken with the container stopped so the LMDB metadata is consistent with the blocks it indexes) → restore → TLS notes (DOMAIN, ports 80/443 reachable).
- Dev is unchanged: compose infra + `pnpm dev`, `MAILER=console` prints codes and invite links to the api log — sign-in works offline with zero setup.
- Sessions/OTP hygiene: expired rows are deleted lazily on access; no scheduled sweeper.

## Notes

**claude** — 2026-08-17T04:00:56Z

Amendment 2026-08-16: the invites surface gains one route - GET /api/v1/invites/{token}, unauthenticated, returning the Workspace name, offered Role, and invited email for a pending invite, refusing exactly as accept does (404 used/revoked/unknown, 410 expired). Accepting signs the caller in as the invite's User, replacing any existing session. Contracts and consumers: k7wegl and 50gsoy. The session-exemption list is therefore: OTP request, OTP verify, health, invite preview, invite accept.

**claude** — 2026-08-18T22:49:56Z

Amendment 2026-08-18 (kjgubg): the web app's test seam, decided.

Third seam — **the web app's pure modules, at the vitest run this repo already has.** No DOM, no component harness, no new dependency. `apps/web` gains `vitest` as a devDependency, the same catalog entry `packages/core` and `packages/fonts` already declare; nothing else is added.

The rule this seam carries, and which binds every later web slice: **behaviour worth testing is extracted into a module and tested there, rather than reached through a rendered tree.** A page component stays a gate and a hand-off — it fetches, it decides with a pure function, it hands the result on. The editor's canvas work follows the same rule into `packages/core` under ADR-0003: selection, transforms, undo, and the compile step are unit-testable logic, and belong where the logic is, not behind a canvas.

Rejected, with reasons, so the question stays closed:

- **Testing Library + jsdom.** Three devDependencies to assert markup that a person sees the moment they open the page. Every rule with teeth — attempt limits, expiry, rate limits, last-Owner, RBAC — is enforced by the api and covered at seam 1; the web app's own share is a status-to-sentence table, three route constants, one pure decision, and `useState`. The affordance criteria (a Viewer is not offered delete, an Editor's panel is inert) are UX, not access control: the api refuses those calls regardless, and does so under test.
- **A browser-driven seam, now.** ADR-0002's Playwright is a pinned render dependency inside the worker's container; borrowing it here would couple the web app's test run to the render pin, and would need a running stack that no check currently assumes.

**Deliberately not under test, and verified by hand instead:** the server-side redirect gates, the whole-document navigations after a cookie changes, and the back/forward-cache recheck in `app/recheck-on-restore.tsx`. jsdom would not have covered any of them either — the one real web defect this project has hit, jmpc8g's back-after-sign-out, is in exactly that class. They are the case for a browser smoke suite, not for a component harness.

**The browser suite, when.** After ex95f4 lands the `app` compose profile, a real browser against a real stack costs one command. Roughly five paths, not a pyramid: signed-out redirect from an app page, sign-in through to landing, sign-out then back, a signed-in visit to /sign-in, invite link to product. Published as its own issue.

**Revisit the decision** when editor logic appears that genuinely cannot be extracted from layout or pointer behaviour. Adding jsdom then is three devDependencies and nothing to migrate; unwinding an established component suite is not that cheap, which is why it is not being added first.
