---
id: ex95f4
title: How does v1 deploy self-hosted in production?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - kjz6f0
    - 6lxoec
    - 2jpnag
parent: v1xa7j
created: 2026-08-14T20:29:53Z
updated: 2026-08-15T03:21:49Z
---

Settle the deployment that makes v1 the "running web app" the goal statement promises — a self-hosted stack where background workers do the rendering — beyond the dev workflow (`docker compose up` for infra + `pnpm dev`).

Interview the user (grill-me skill, limited to this question). Settle at least:

- The target host (the user's own machine, a home server, a VPS?) and what "production" means for a single-user v1 — is the settled dev workflow already the answer, or a full compose stack?
- The production compose topology left open by node kjz6f0: containers for api (FastAPI), web (Next.js), and worker, joining the settled infra services (postgres:17, redis:8, pinned MinIO).
- How the pinned worker image (ADR-0002: pinned Chromium build; node 6lxoec: full Chromium new headless, fontconfig-pinned fonts) is built, versioned, and used in production — the generation-platform spec reserves it for goldens, CI, and production, but the production half is unwritten.
- Config and secrets handling (INTERNAL_API_TOKEN, Postgres/MinIO credentials), ports, TLS / reverse proxy if any.
- Volume persistence and backup expectations for Postgres and MinIO.
- What lands in the repo (compose file(s), README runbook) versus what stays host-local.

Out of this node's scope (stays on the root's Frontier): what productizing changes — accounts-era, multi-tenant deployment.

Pointers: root v1xa7j Frontier entry "Deployment"; node kjz6f0's note (dev compose, repo layout); node 2jpnag's note (bootstrap order, pinned-image usage, internal auth); spec issues 1qoccb (core) and 0egsmf (generation platform).

## Notes

**claude** — 2026-08-14T20:36:23Z

Sibling node ejy8hn (v1 auth and API key model) was added after this node: your answers on exposure (localhost/LAN/public) and any reverse proxy set its threat model, and its auth mechanism may live in your topology. Coordinate; neither blocks the other.

**claude** — 2026-08-15T03:21:44Z

ANSWER (settled by interview, user confirmed 2026-08-14).

TARGET: no fixed host — v1 production is a portable compose stack that runs the same on a laptop or a rented box. The deployer is docker-literate and the repo is the distribution: clone, copy .env.example to .env, docker compose --profile app up -d --build.

TOPOLOGY: one root docker-compose.yml with profiles. The default profile stays infra-only (postgres:17, redis:8, pinned MinIO — kjz6f0's dev behavior untouched, infra ports bound to localhost). The `app` profile adds four services: api (FastAPI; entrypoint runs `alembic upgrade head` before serving — compose up after git pull is the whole upgrade), web (Next.js production build), worker (the ADR-0002 pinned-Chromium image), caddy. App services get restart: unless-stopped; the worker runs one replica (concurrency 8 inside it, per kjz6f0).

ENTRY: Caddy is the only service publishing ports — single origin, routing / → web and /api, /assets, /jobs → api. Setting DOMAIN turns on automatic Let's Encrypt HTTPS; unset serves plain HTTP for local use. Production therefore has no cross-origin font fetches: 3ko2p7's CORS * carve-out becomes a dev-only fact. Node ejy8hn inherits: exposure is the deployer's choice (local vs public box), and there is exactly one front door (Caddy) where auth could sit.

IMAGES: built from source — compose build: sections point at the repo's Dockerfiles for api, web, worker. The worker Dockerfile is the single home of the Chromium + fontconfig pin, shared by goldens, CI, and production. Version identity is the git commit built from. No registry in v1.

CONFIG: committed .env.example listing POSTGRES_PASSWORD, MINIO_ROOT_USER/MINIO_ROOT_PASSWORD, INTERNAL_API_TOKEN, optional DOMAIN; deployer copies to gitignored root .env, secrets generated with openssl rand -hex 32. No secret manager, no auto-generation script.

PERSISTENCE: named volumes for postgres, minio, and caddy (cert storage). Backup is a documented manual procedure — pg_dump via docker compose exec plus a MinIO data copy, with restore steps — no scheduled backup service in the stack.

RUNBOOK: docs/DEPLOYMENT.md (first deploy, upgrade, backup/restore); README links to it.

No ADR: every choice is reversible (swap the proxy, add a registry later) and unsurprising given the record; this note is the record.
