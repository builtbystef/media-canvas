---
id: ex95f4
title: How does v1 deploy self-hosted in production?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - kjz6f0
    - 6lxoec
    - 2jpnag
parent: v1xa7j
created: 2026-08-14T20:29:53Z
updated: 2026-08-14T20:36:23Z
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
