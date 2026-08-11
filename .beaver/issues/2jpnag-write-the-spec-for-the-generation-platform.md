---
id: 2jpnag
title: Write the spec for the generation platform
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - ylg1wr
    - jgo8tv
    - kjz6f0
parent: v1xa7j
created: 2026-08-11T00:28:43Z
updated: 2026-08-11T01:54:31Z
---

The generation-platform area is settled: MVP cut and pillar order (ylg1wr), the generation contract — API surface, batch input, job lifecycle, output delivery (jgo8tv), and the infrastructure — Postgres/Redis+BullMQ/MinIO, alloy-based monorepo, FastAPI-owned schema, worker-reports-via-API (kjz6f0, ADR-0004, ADR-0005).

Read those three nodes' notes and ADR-0004/0005 (not the whole roadmap). The core spec 1qoccb fixes the seams this spec consumes: core's validate/resolve/compile, the worker's render(svg, options), and the content-addressed asset read contract. Interview to close remaining gaps (likely: internal worker-report endpoint shape, job/row table sketch, queue payload contents, compose service details, dev bootstrap order). Confirm with the user, then invoke the create-specification skill. Publish the spec issue with blocking edges back to ylg1wr, jgo8tv, kjz6f0.

## Notes

**claude** — 2026-08-11T01:29:06Z

INTERVIEW SETTLED (user confirmed all recommendations, 2026-08-11). Decisions for the generation-platform spec:

EXECUTION SEAMS:
- The worker runs a small internal HTTP service alongside its BullMQ consumer: POST /validate {template, rows} -> {errors: [{rowIndex, variable?, message}]} and POST /render {template, values, options} -> bytes | 422 with named-Variable errors. FastAPI calls /validate on every batch submit (atomic validation) and /render for the synchronous single-render endpoint. The queue is used only for batch rows. Reason: validate/resolve/compile/render are TypeScript-only (ADR-0003); FastAPI treats documents as opaque JSON.
- CSV cell-typing lives in packages/core next to validate: FastAPI parses CSV text into string cells only and passes them to worker /validate with a cells flag; strict true/false, JSON number grammar, empty-cell-means-omitted rules live once in core.

JOB SEMANTICS:
- A Generation Job snapshots the Template at submit time (JSONB on the job row); all rendering reads the snapshot. Template edits/deletes never touch in-flight or completed jobs. template_id kept for lineage only.
- Worker uploads rendered bytes directly to MinIO via S3 SDK, then reports metadata to FastAPI (ADR-0005 forbids only Postgres writes).
- BullMQ payload is ids-only: {jobId, rowId}. Worker fetches GET /internal/jobs/{jobId} -> {template_snapshot, output_format} (cached per job) and GET /internal/jobs/{jobId}/rows/{rowId} -> {values, name, row_index}.
- No denormalized counters: polling endpoint derives progress via GROUP BY status over rows. POST /internal/jobs/{jobId}/rows/{rowId}/result {status: succeeded|failed, error?, output_key?} updates the row and, in the same transaction, flips the job to completed when no row remains queued/rendering. Cancel marks unrendered rows skipped.

TABLES:
- generation_jobs: id UUID PK, template_id FK (lineage only), template_snapshot JSONB, output_format JSONB, state (queued|rendering|completed|failed|canceled), idempotency_key nullable, created_at, updated_at, canceled_at nullable. Idempotency unique on (template_id, idempotency_key).
- generation_rows: id UUID PK, job_id FK, row_index int, name (resolved output name), values JSONB, status (queued|rendering|succeeded|failed|skipped), error JSONB nullable (core ValidationError shape), output_key nullable, attempts int, started_at/finished_at nullable. Unique (job_id, name) and (job_id, row_index).

INTERNAL AUTH: one shared secret from env (INTERNAL_API_TOKEN), bearer header, checked on every internal route in both directions (FastAPI /internal/* and the worker HTTP service).

DEV & COMPOSE:
- pnpm dev runs api, web, AND worker as local processes (worker uses locally-installed Playwright Chromium — never for goldens). Pinned container image is for golden tests, CI, production only. Compose is infra-only in dev.
- Root docker-compose.yml: postgres:17, redis:8, minio/minio (pinned RELEASE tag), named volumes, healthchecks, default ports (5432, 6379, 9000+9001).
- Bootstrap order (README): docker compose up -d --wait -> uv sync -> alembic upgrade head -> pnpm install -> pnpm dev. API ensures MinIO buckets on startup (idempotent); migrations run manually.

NEXT: user runs /create-specification to publish the spec issue with blocking edges back to ylg1wr, jgo8tv, kjz6f0; then this node closes.

**claude** — 2026-08-11T01:54:31Z

Spec published as issue 0egsmf (Generation platform), with blocking edges back to ylg1wr, jgo8tv, kjz6f0. Seams agreed with the user: public /api/v1 surface, worker internal HTTP service, worker queue consumer. Draft approved by the user 2026-08-11.
