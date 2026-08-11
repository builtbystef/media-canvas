---
id: kjz6f0
title: 'Which infrastructure: database, queue, object storage, and repository layout?'
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - jgo8tv
    - 7mza2q
    - gqr8bf
parent: v1xa7j
created: 2026-08-08T07:09:22Z
updated: 2026-08-11T00:28:31Z
---

Interview the user (grill-me skill, limited to this question) to settle the infrastructure and repo shape. Some options may need quick fact-checks inline; if a real research question emerges, split it out.

Settle: the database (Postgres vs SQLite for self-hosted-first); the task queue and worker runtime (Celery/RQ/arq + Redis, or DB-backed queue) given the job model from node jgo8tv and the renderer's runtime from node 7mza2q (a Chromium-based renderer may want Node workers, not Python); object storage for uploads and outputs (local disk vs S3-compatible, given self-hosted-first); repository layout (monorepo with Next.js app + FastAPI service + workers + CLI); and how frontend/backend share the API contract (OpenAPI codegen, shared schema package).

Record hard-to-reverse picks as ADRs. Closing this unblocks establishing the checks (existing issue g4y1ii).

## Notes

**claude** — 2026-08-11T00:28:31Z

ANSWER (settled by interview, user confirmed 2026-08-10).

DATABASE: Postgres. Two runtimes write state concurrently (FastAPI creates Jobs/Rows, workers report results mid-batch); SQLite's single-writer model across processes is the wrong fit, and self-hosting already means a compose stack.

QUEUE: Redis + BullMQ (user chose Redis over a DB-backed queue). FastAPI enqueues with the official Python BullMQ package; the Node worker consumes with the Node package — same queue, no bridge service. One BullMQ task per Row, attempts: 2 with a transient-error filter implementing the contract's one automatic retry (jgo8tv); worker concurrency 8 = the pages-per-browser baseline (gqr8bf). Postgres stays the source of truth for all Job/Row state; Redis carries only the work signal. → ADR-0004.

OBJECT STORAGE: MinIO from day one (user chose over local disk), accessed via S3 SDK. All file serving is proxied through FastAPI (/assets/{hash}, /jobs/{id}/outputs/{name}) streaming from MinIO — never presigned MinIO URLs, so the contract's immutable/stable URLs hold, storage topology stays hidden, and later auth has one enforcement point.

REPO LAYOUT: monorepo bootstrapped from the user's alloy template (~/Code/personal/alloy): pnpm workspaces + Vite+ (vp) on the TS side, uv + ruff/ty/pytest on the Python side; apps/api (FastAPI), apps/web (Next.js), packages/api-client generated from the committed FastAPI OpenAPI schema via @hey-api/openapi-ts, with a CI contract job failing on drift. Media Canvas adds: apps/worker (Node + Playwright + BullMQ consumer, TypeScript, carries the pinned-Chromium Dockerfile per ADR-0002) and packages/core (ADR-0003 shared package). Infra (Postgres, Redis, MinIO) as a root docker-compose.yml that pnpm dev assumes is already up.

API CONTRACT: alloy's OpenAPI codegen pipeline, with the carve-out that Design Document / Variable-value payloads are typed by packages/core and opaque JSON to FastAPI — the generated client covers the job/render/asset surface only.

DB OWNERSHIP: FastAPI owns the Postgres schema and Alembic migrations and is the only writer; the worker reports row results via a small internal FastAPI endpoint and holds no DB client. → ADR-0005.

Unblocks the checks issue g4y1ii (stack is now settled).
