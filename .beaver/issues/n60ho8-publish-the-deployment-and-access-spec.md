---
id: n60ho8
title: Publish the deployment and access spec
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - ex95f4
    - ejy8hn
    - u2ovlu
parent: v1xa7j
created: 2026-08-15T03:22:03Z
updated: 2026-08-15T04:38:05Z
---

The deployment-and-access area is the pair {ex95f4 (v1 self-hosted production deployment), ejy8hn (v1 auth and API key model)}. They were interviewed separately but an implementer needs them together: Caddy is both the production topology's single origin and the front door where auth enforcement meets the route map (/ → web; /api, /assets, /jobs → api), and the .env layout must carry whatever secrets the auth model adds.

When both blockers are closed: read their notes (only theirs — not the full roadmap's), interview the user to close any gaps between the two answers (grill-me skill), confirm, then invoke the create-specification skill. Publish the spec issue with blocking edges back to ex95f4 and ejy8hn.

Expected coverage: the profiled compose topology and service definitions, Caddy routing and the DOMAIN TLS flip, image build/versioning from the repo's Dockerfiles, .env.example contents, volumes and the manual backup/restore procedure, docs/DEPLOYMENT.md runbook outline — joined with the auth mechanism, API key issuance/storage/enforcement, the route auth map, and the fate of the dev-only CORS carve-out (3ko2p7).

Pointers: notes of ex95f4 and ejy8hn; kjz6f0 (dev compose, repo layout); 2jpnag (bootstrap order, INTERNAL_API_TOKEN); ADR-0002 (pinned worker image).

## Notes

**claude** — 2026-08-15T04:38:05Z

DONE (2026-08-15). Spec published as issue 88v6vg (Deployment and access), label spec, with blocking edges back to ex95f4, ejy8hn, and u2ovlu. Seams agreed with the user: the public HTTP API surface (auth, accounts, RBAC, enforcement) and the Mailer interface (recording fake; drivers thin); deployment carries no test seam beyond the DEPLOYMENT.md runbook and a docker compose config check in CI.

Interview settled seven gaps (all user-confirmed): (1) email-link base URL derived https://{DOMAIN} → PUBLIC_URL → http://localhost:3000, acceptance page at /invites/{token}; (2) Caddy publishes 80+443 with DOMAIN, else HTTP_PORT (default 80); (3) no session-signing secret — opaque 256-bit tokens SHA-256-hashed at rest, same as API keys; (4) OTP codes and rate-limit counters live in Postgres (Redis stays a work signal, ADR-0004); (5) invites expire in 7 days, one pending per (workspace, email), re-invite replaces; (6) workspace lifecycle: rename, role change, removal, self-leave (last-Owner rule blocks sole-Owner leave/demote), delete is Owner-only unconditional hard cascade (DB then storage prefixes, 3ko2p7 spirit); (7) health is /api/health, covered by the existing Caddy map.

Draft approved by the user 2026-08-15, including three flagged additions: last_used_at on api_keys, member-visible member list, and User email-change/account-deletion pushed out of v1. The bundled-font per-Workspace seeding (u2ovlu flag, already user-reviewed) is confirmed in the spec unchanged.
