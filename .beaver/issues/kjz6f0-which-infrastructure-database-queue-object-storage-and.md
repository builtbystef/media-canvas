---
id: kjz6f0
title: 'Which infrastructure: database, queue, object storage, and repository layout?'
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - jgo8tv
    - 7mza2q
    - gqr8bf
parent: v1xa7j
created: 2026-08-08T07:09:22Z
updated: 2026-08-10T03:21:05Z
---

Interview the user (grill-me skill, limited to this question) to settle the infrastructure and repo shape. Some options may need quick fact-checks inline; if a real research question emerges, split it out.

Settle: the database (Postgres vs SQLite for self-hosted-first); the task queue and worker runtime (Celery/RQ/arq + Redis, or DB-backed queue) given the job model from node jgo8tv and the renderer's runtime from node 7mza2q (a Chromium-based renderer may want Node workers, not Python); object storage for uploads and outputs (local disk vs S3-compatible, given self-hosted-first); repository layout (monorepo with Next.js app + FastAPI service + workers + CLI); and how frontend/backend share the API contract (OpenAPI codegen, shared schema package).

Record hard-to-reverse picks as ADRs. Closing this unblocks establishing the checks (existing issue g4y1ii).
