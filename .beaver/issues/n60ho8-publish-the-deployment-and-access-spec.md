---
id: n60ho8
title: Publish the deployment and access spec
state: todo
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - ex95f4
    - ejy8hn
    - u2ovlu
parent: v1xa7j
created: 2026-08-15T03:22:03Z
updated: 2026-08-15T04:02:06Z
---

The deployment-and-access area is the pair {ex95f4 (v1 self-hosted production deployment), ejy8hn (v1 auth and API key model)}. They were interviewed separately but an implementer needs them together: Caddy is both the production topology's single origin and the front door where auth enforcement meets the route map (/ → web; /api, /assets, /jobs → api), and the .env layout must carry whatever secrets the auth model adds.

When both blockers are closed: read their notes (only theirs — not the full roadmap's), interview the user to close any gaps between the two answers (grill-me skill), confirm, then invoke the create-specification skill. Publish the spec issue with blocking edges back to ex95f4 and ejy8hn.

Expected coverage: the profiled compose topology and service definitions, Caddy routing and the DOMAIN TLS flip, image build/versioning from the repo's Dockerfiles, .env.example contents, volumes and the manual backup/restore procedure, docs/DEPLOYMENT.md runbook outline — joined with the auth mechanism, API key issuance/storage/enforcement, the route auth map, and the fate of the dev-only CORS carve-out (3ko2p7).

Pointers: notes of ex95f4 and ejy8hn; kjz6f0 (dev compose, repo layout); 2jpnag (bootstrap order, INTERNAL_API_TOKEN); ADR-0002 (pinned worker image).
