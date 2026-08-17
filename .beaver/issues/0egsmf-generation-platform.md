---
id: 0egsmf
title: Generation platform
state: todo
labels:
    - spec
depends_on:
    - ylg1wr
    - jgo8tv
    - kjz6f0
created: 2026-08-11T01:54:08Z
updated: 2026-08-17T04:00:56Z
---

## Problem Statement

A Template exists, but producing assets from it is manual: one design, one export, one file. The user needs to generate assets from data — one-off from the UI, or by the hundreds through an API or a CSV upload — without watching each render, and without a bad row silently ruining a batch or a good batch being lost to a mid-flight template edit.

## Solution

A generation API in front of a render worker fleet. A single render is one synchronous call that returns the file. A batch becomes a Generation Job: submission validates every Row atomically against the Template's Variables, workers render the Rows concurrently with per-Row failure isolation and one automatic retry on transient errors, progress is visible by polling, and finished outputs are downloadable per Row or as one zip. The Template is snapshotted at submission, so in-flight work is immune to later edits. The whole stack — API, worker, Postgres, Redis, Garage — runs locally from one compose file plus `pnpm dev`.

## User Stories

1. As a template author, I want a single synchronous render call that returns the file, so that one-off generation is one round trip.
2. As a batch operator, I want submission to reject the entire batch with row-indexed, named-Variable errors when any Row is invalid, so that a batch either starts clean or not at all.
3. As a batch operator, I want a render-time failure (e.g. a dead image URL) to fail only its Row after one automatic retry, so that one bad URL cannot burn the other 999 renders.
4. As a batch operator, I want to poll a job and see its state and per-Row progress, so that I know when outputs are ready without a callback.
5. As a batch operator, I want outputs served per Row and as one zip, at stable URLs, so that retrieval is scriptable.
6. As a batch operator, I want to resubmit with the same idempotency key after a network failure and get the existing Job back, so that a retry never renders twice.
7. As a batch operator, I want to cancel a running Job and keep the already-rendered Rows, so that a wrong batch stops costing money without losing finished work.
8. As a UI user, I want to upload a CSV against a Template, so that batch generation needs no JSON tooling.
9. As a template author, I want an edited or deleted Template to leave in-flight and completed Jobs untouched, so that batch output is reproducible from the Job itself.
10. As a developer, I want the full stack up from a documented bootstrap sequence, so that a fresh clone renders a batch the same day.

## Implementation Decisions

### Services and responsibilities

Five services. **api** (FastAPI): owns the Postgres schema and Alembic migrations, is the only Postgres writer (ADR-0005), enqueues Row tasks, serves the public API and all files by proxying object storage — never presigned URLs. **worker** (Node, TypeScript): BullMQ consumer plus a small internal HTTP service; holds no DB client; uploads outputs directly to object storage via the S3 SDK; the only service with Chromium. **Postgres** is the source of truth for all Job/Row state; **Redis** (BullMQ) carries only the work signal (ADR-0004); **Garage** holds assets and outputs behind the S3 API.

Because `validate`/`resolve`/`compile`/`render` are TypeScript-only (ADR-0003) and the api treats Design Documents as opaque JSON, all document interpretation crosses to the worker: the api calls the worker's internal HTTP service for batch validation and synchronous renders. The BullMQ queue is used only for batch Rows.

### Public API (under `/api/v1`, versioned independently of `schemaVersion`)

```
POST /documents/{id}/render        (amended by node 8h50hu — was /templates/{id}/render)
  body: { values: Record<string, unknown>, output: OutputFormat }
  → 200 file bytes (Content-Type per format) | 422 { errors: NamedVariableError[] }
  Synchronous; output is not persisted — the response is the delivery.
  Resolves any documents row, either kind: a template validates `values` against its
  Variables; a design renders with `values: {}`, and any supplied value is a 422.
  This is also how a plain design exports a file. Batch endpoints stay template-only.

POST /templates/{id}/jobs
  body (application/json): { rows: Row[], output: OutputFormat, idempotencyKey?: string }
  body (text/csv):         CSV; header row = Variable names (+ optional _name column)
  → 201 JobView | 200 JobView (existing job for the same idempotency key)
  | 422 { errors: RowError[] }   — any invalid Row rejects the whole batch; nothing renders

GET    /jobs/{id}            → JobView
POST   /jobs/{id}/cancel     → JobView   (canceled is terminal; unrendered Rows become skipped)
DELETE /jobs/{id}            → 204       (deletes DB records and stored outputs)
GET    /jobs/{id}/outputs/{name}.{ext}   → file bytes (proxied from storage)
GET    /jobs/{id}/outputs.zip            → zip of all succeeded Rows

type OutputFormat = { format: 'png', scale: 1|2|3 }
                  | { format: 'jpeg', quality?: number }   // default 90
                  | { format: 'pdf' }                      // one format per Job — mixed formats = two Jobs
type Row = Record<string, unknown> & { _name?: string }
type NamedVariableError = { variable?: string, message: string }
type RowError = NamedVariableError & { rowIndex: number }
type JobView = {
  id: string, templateId: string, state: 'queued'|'rendering'|'completed'|'failed'|'canceled',
  output: OutputFormat, createdAt: string,
  progress: { queued: number, rendering: number, succeeded: number, failed: number, skipped: number },
  rows: Array<{ index: number, name: string, status: RowStatus,
                error?: NamedVariableError, url?: string }>
}
type RowStatus = 'queued'|'rendering'|'succeeded'|'failed'|'skipped'
```

`_name`: charset `[A-Za-z0-9._-]`, max 128 chars, unique within the batch — violations are submission-time errors. Rows without `_name` get the zero-padded row index. `completed` covers runs with per-Row failures; per-Row statuses carry the detail. Idempotency key is unique per `(templateId, idempotencyKey)`. Outputs have no auto-expiry; `DELETE /jobs/{id}` is the only removal.

**CSV handling**: the api parses CSV text into string cells only. Cell-typing lives in the shared core package next to `validate`, reached through the worker's `/validate` with a `cells` flag: boolean cells are literal case-sensitive `true`/`false`, number cells follow the JSON number grammar, an empty cell means omitted for every type (default applies; no default → validation error). Explicit `""` requires JSON.

### Internal contracts (bearer `INTERNAL_API_TOKEN` from env, both directions)

Worker's internal HTTP service (called by the api):

```
POST /validate  { template: DesignDocument, rows: Row[], cells?: true }
  → { errors: RowError[] }                    // empty = clean; cells:true applies CSV typing first
POST /render    { template: DesignDocument, values: Record<string, unknown>, output: OutputFormat }
  → 200 bytes | 422 { errors: NamedVariableError[] }
```

api's internal endpoints (called by the worker):

```
GET  /internal/jobs/{jobId}                → { templateSnapshot: DesignDocument, output: OutputFormat }
                                             // worker caches per job
GET  /internal/jobs/{jobId}/rows/{rowId}   → { values, name, rowIndex }
POST /internal/jobs/{jobId}/rows/{rowId}/result
  body: { status: 'succeeded'|'failed', error?: NamedVariableError, outputKey?: string }
  // In one transaction: update the Row; flip the Job to completed
  // when no Row remains queued/rendering.
```

### Queue

One BullMQ task per Row, payload ids-only: `{ jobId, rowId }`. `attempts: 2` with a transient-error filter (fetch failure, timeout) implements the contract's single automatic retry. Worker concurrency 8 — the pages-per-browser baseline. The worker's flow per task: fetch job bundle (cached) and row → `validate`/`resolve`/`compile` via core → `render` → upload bytes to object storage at `jobs/{jobId}/{name}.{ext}` → report result. The synchronous `/render` path shares the same page pool of 8.

### Schema (owned by api, Alembic)

```
generation_jobs:  id UUID PK, template_id FK (lineage only — rendering reads the snapshot),
                  template_snapshot JSONB, output_format JSONB,
                  state ('queued'|'rendering'|'completed'|'failed'|'canceled'),
                  idempotency_key TEXT NULL,  UNIQUE (template_id, idempotency_key),
                  created_at, updated_at, canceled_at NULL
generation_rows:  id UUID PK, job_id FK, row_index INT, name TEXT, values JSONB,
                  status ('queued'|'rendering'|'succeeded'|'failed'|'skipped'),
                  error JSONB NULL, output_key TEXT NULL, attempts INT,
                  started_at NULL, finished_at NULL,
                  UNIQUE (job_id, name), UNIQUE (job_id, row_index)
```

No denormalized counters — progress derives from one `GROUP BY status` over the Job's Rows.

### Dev environment

Root `docker-compose.yml`, infra only: `postgres:17`, `redis:8`, `dxflrs/garage:v2.3.0`; named volumes, healthchecks, default ports (5432, 6379, 3900 — Garage's S3 port; no console exists to expose). Garage runs `server --single-node --default-access-key`, which builds the cluster layout on first boot and mints the credentials from `GARAGE_DEFAULT_ACCESS_KEY` / `GARAGE_DEFAULT_SECRET_KEY` — no init container and no CLI step. Two things Garage requires beyond the image: a committed config file mounted at `/etc/garage.toml` (`infra/garage.toml` — it will not start without one, and `metadata_dir`, `data_dir` and the bind addresses have no environment equivalents), and `GARAGE_RPC_SECRET`, which is mandatory even for one node. Its state lives under `/var/lib/garage`, holding `meta/` and `data/`, so one named volume covers both. `pnpm dev` runs api, web, and worker as local processes; the dev worker uses locally-installed Playwright Chromium — never valid for golden baselines. The pinned worker container image (ADR-0002) is for golden tests, CI, and production only. Bootstrap order, documented in the README: `docker compose up -d --wait` → `uv sync` → `alembic upgrade head` → `pnpm install` → `pnpm dev`.

The api ensures its buckets on startup (idempotent), unchanged from the MinIO shape and verified against Garage v2.3.0: the key that `--default-access-key` mints carries `allow_create_bucket`, so the api's own `CreateBucket` succeeds and the bucket name lives in exactly one place — the api's configuration. Garage's `--default-bucket` flag is therefore not used; a second place naming the bucket could only disagree with the first. "Idempotent" means the api treats `BucketAlreadyOwnedByYou` and `BucketAlreadyExists` as success: Garage raises the former rather than returning 200, as does AWS S3 outside `us-east-1`. Migrations still run manually.

## Dependencies

- **bullmq** (Node) and the official **Python BullMQ package** — the queue's two ends: FastAPI produces, the worker consumes, no bridge service (ADR-0004).
- **S3 SDK, both runtimes** — boto3 (api: proxied file serving, bucket bootstrap, job deletion) and the AWS SDK for JS (worker: direct output upload).
- **Alembic + a Postgres driver** on the api — schema ownership (ADR-0005).
- An **HTTP server for the worker's internal service** (Fastify or Node's built-in `http`) and a **zip streaming library** on the api — implementer's choice within these roles; no other new dependency without amending this section.

Playwright, opentype.js, zod, pixelmatch/pngjs are already owned by the core spec (1qoccb).

## Testing Decisions

Three seams, agreed:

1. **Public API** (FastAPI test client; worker HTTP faked behind its contract, queue faked). Worked examples: a 3-row batch where row 1 omits a required Variable → 422 naming `rowIndex: 1` and the Variable, nothing enqueued; the same batch resubmitted with the same idempotency key → the existing Job, no new rows; CSV `price` column cell `"4.99"` with a number Variable → typed `4.99` reaches `/validate` (cells flag); `_name` collision → 422 at submission; cancel with 2 succeeded / 3 queued → Job `canceled`, 3 Rows `skipped`, 2 outputs still served; last Row result reported → Job flips to `completed` and progress counts match a `GROUP BY` of Row statuses.
2. **Worker internal HTTP service** (Node-side contract tests against real core). Worked examples: `/validate` with `cells: true` and boolean cell `True` → error (case-sensitive literal); empty cell for a defaulted Variable → clean; `/render` with an unknown Variable in values → 422 named error, no browser launch.
3. **Worker queue consumer** (faked internal api + S3-compatible store). Worked examples: happy path uploads to `jobs/{jobId}/{name}.png` and reports `succeeded` with that key; first fetch of a Row image URL times out, second succeeds → one retry consumed, Row `succeeded`, `attempts: 2`; a validation-shaped error → no retry, reported `failed` with the named-Variable error.

One compose-level smoke rides on seam 1: submit a 2-row batch against the real stack, poll to `completed`, download the zip. External behavior only at every seam; internal calls are observed via their contracts, never by reaching into the DB from tests on the other side of a seam. Prior art: none — this is the repository's first code; the golden-image harness on `prototype/render-fidelity` covers render fidelity and is out of scope here.

## Out of Scope

- Auth and API keys — the contract is auth-agnostic; the proxied file serving and `INTERNAL_API_TOKEN` are the later enforcement points (Frontier).
- Webhooks — polling only in v1 (Frontier).
- Output retention policy — no auto-expiry; explicit delete only (Frontier).
- CLI — a later thin client of this API (Frontier).
- Fleet-level scaling, retry policy beyond the single automatic per-Row retry, observability (Frontier).
- Mixed output formats within one Job; explicit `""` via CSV; server-side persistence of single-render outputs; a `completed_with_errors` state (all settled out, node jgo8tv).
- The editor, template promotion UI, and upload endpoints for fonts/images.
- Everything the core spec (1qoccb) owns: document schema, validation semantics, compiler, `render(svg, options)`, golden baselines.

## Further Notes

- The worker never writes Postgres and the api never interprets a Design Document — every crossing goes through the contracts above. If an implementation session finds a need to break either rule, that is a spec problem, not an implementation choice (ADR-0003/0004/0005).
- Throughput to preserve: ~166 ms/render at concurrency 8, ≈2.8 min per 1,000 Rows on one host.
- Job deletion removes both DB records and the `jobs/{jobId}/` prefix in storage.
- The `web` app's CSV-upload UI is a thin client of `POST /templates/{id}/jobs` (text/csv) — no separate upload contract.

## Notes

**claude** — 2026-08-14T05:54:59Z

AMENDMENT (node 8h50hu, 2026-08-14): the synchronous render endpoint is now POST /documents/{id}/render and accepts any document kind — a template validates values against its Variables; a design renders with values {} and any supplied value is a 422. Reason: the editor's Generate dialog (settled by 8h50hu) is also the export path for plain designs; without this, a design could only become a file by promoting it into an empty Template. Batch endpoints (/templates/{id}/jobs) stay template-only.

**claude** — 2026-08-14T19:54:24Z

AMENDMENT (node q44rtp, 2026-08-14): the batch UI's global Jobs page needs a job list. Add GET /api/v1/jobs → array of JobView minus the rows array, plus templateName denormalized in (one server-side join), ordered newest first, no pagination in v1 (the same all-records rule node 9eooei set for document and asset lists). No other contract change — the batch UI is otherwise a pure client of this spec.

**claude** — 2026-08-14T20:20:22Z

AMENDMENT (node p1fkjl, 2026-08-14): the text/csv variant of POST /templates/{id}/jobs had no carrier for the output format or the idempotency key — the JSON body's fields have no CSV equivalent. For a text/csv submission both travel as flat query parameters: ?format=png&scale=2 | ?format=jpeg&quality=90 | ?format=pdf, plus &idempotencyKey=... (same optionality as the JSON field). One channel, no header-casing rules; the JSON variant is unchanged. The batch UI submits the raw CSV bytes this way — cell-typing stays server-side in core, so the browser never submits client-typed JSON.

**claude** — 2026-08-15T04:08:06Z

AMENDMENT (node u2ovlu, per node ejy8hn / ADR-0009, 2026-08-15): v1 is multi-tenant — Workspaces own templates, jobs, and outputs. What changes in this spec:

- Schema: `generation_jobs` gains a NOT NULL `workspace_id` FK; `generation_rows` inherit the Workspace through `job_id`. The `UNIQUE (template_id, idempotency_key)` rule is unchanged — templates are Workspace-owned, so it is already tenant-safe.
- Routes: `POST /templates/{id}/jobs` and `POST /documents/{id}/render` keep their shapes — the document's Workspace scopes the work. Item routes (`GET /jobs/{id}`, cancel, delete, outputs, zip) stay id-based. Authorization on every route = the record's Workspace × the caller's Membership (session cookie) or the API key's Workspace. The q44rtp jobs-list amendment becomes per-Workspace: `GET /api/v1/workspaces/{wsId}/jobs` — same payload (JobView minus rows, plus templateName), newest first, unpaginated.
- Auth: the Out-of-Scope line "Auth and API keys — the contract is auth-agnostic (Frontier)" is superseded. Every public route requires a session cookie or an API key (`Authorization: Bearer mc_...`), except OTP request/verify, invite acceptance, and /health. API keys are Workspace-owned and Editor-equivalent on exactly this spec's surface (sync render, job submission/polling/cancel/delete, per-Row outputs, the zip) — jgo8tv's "retrieval is scriptable" now means with a key in the header. RBAC via cookie: Editor/Owner submit, cancel, delete; Viewer reads and downloads. The internal contracts (INTERNAL_API_TOKEN, worker↔api) are unchanged.
- Storage: output keys gain a workspace scope — `{workspaceId}/jobs/{jobId}/{name}.{ext}`; job deletion removes that prefix.
- The accounts surface itself (OTP, sessions, Workspaces, Memberships, invites, API-key management) is specified by node n60ho8's spec, not here.

**claude** — 2026-08-15T06:24:11Z

One issue under spec 88v6vg is blocked on this spec and currently points its blocking edge at this umbrella: lgqvg9 (API keys authenticate the generation surface). The accounts work builds API keys and proves only the refused cases (403 off-surface, 401 revoked); the permitted case needs the render and job routes this spec owns. When this spec is sliced, retarget that edge to the slice that lands them.

**claude** — 2026-08-15T06:54:47Z

SEAM DECISIONS (issue-slicing session, user decided 2026-08-15) — two gaps the tenancy amendment opened, settled before implementation. Both follow from the same fact: asset serving became authenticated, and the worker is a member of no Workspace.

1. THE RENDER PAGE FETCHES NOTHING. The worker loads every asset a document references — Font Asset bytes for the compiler's metrics and inlined faces, and every image, whether an app-held Image Asset or an external http(s) URL — and hands the compiler data URIs, so the compiled markup is fully self-contained and the render page issues no network requests at all. This matches the font decision on 1qoccb and makes a dead image URL an explicit, retryable worker error rather than a silently broken picture, which is what this spec's own retry example already assumes. Rejected: attaching the internal token to the page's api-origin requests via route interception (a second credential path, and a blanket header would leak the token to external image hosts); an internal unauthenticated asset route (asset bytes protected by network topology instead of a credential).

2. ASSET BYTES COME FROM THE API, OVER THE INTERNAL CREDENTIAL. The api exposes internal asset-bytes access to the worker under INTERNAL_API_TOKEN, so the api remains the only thing that reads asset rows and knows the storage key layout. Rejected: the worker reading object storage directly by Workspace plus hash (it already has S3 credentials for uploads, but that couples this spec to the editor spec's key layout and duplicates hash verification).

CONSEQUENT CONTRACT CHANGE: the worker's internal /validate and /render payloads gain the Workspace id. They carried no tenant context at all, and an asset's identity is (workspace_id, hash) — without it the worker cannot resolve a single font or image. The endpoint the worker calls for those bytes belongs to the asset pipeline (spec ek7pq1); this spec builds against its contract and exercises it for real in the end-to-end smoke.

**claude** — 2026-08-17T04:00:56Z

Amendment 2026-08-16 to the internal contracts: (1) the queued-to-rendering transition is carried by the internal Row fetch - fetching a Row marks it rendering and stamps started_at in the same request, the first flip moving the Job to running (4dpprd). (2) The worker-facing asset-bytes route this spec builds against is now written down on jr6mye: GET /internal/workspaces/{workspaceId}/assets/{assetId}. (3) The validate payload carries the Workspace id (gxwr7t), completing the 2026-08-15 seam decision.
