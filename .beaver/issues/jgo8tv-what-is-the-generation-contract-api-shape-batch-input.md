---
id: jgo8tv
title: 'What is the generation contract: API shape, batch input format, job lifecycle, output delivery?'
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - k77nv9
parent: v1xa7j
created: 2026-08-08T07:09:08Z
updated: 2026-08-10T23:02:12Z
---

Interview the user (grill-me skill, limited to this question) to settle how assets are generated at scale.

Settle: the API surface for generation (render one asset from a template + values; submit a batch; poll or webhook for completion); the batch input format (CSV/JSON schema, how columns map to template variables); the job lifecycle (states, retries, partial failure of a 1,000-row batch, idempotency); and output delivery (where files land, naming, how the caller retrieves them, retention).

Input: templating semantics from node k77nv9 define what a row of values means and how bad values fail. The CLI and batch-upload UI are thin clients of this contract — settling it here settles most of them.

## Notes

**claude** — 2026-08-10T23:02:12Z

ANSWER (settled by interview, user confirmed 2026-08-10). Glossary gained: Generation Job, Row. Auth/API keys stay a separate Frontier item; this contract is auth-agnostic.

API SURFACE (under /api/v1, versioned independently of document schemaVersion):
- Single render is SYNCHRONOUS: POST /templates/{id}/render with values + format returns the file bytes on success, 422 with named-Variable errors on bad values. Output is NOT persisted server-side — the response is the delivery. (~166 ms/render makes sync viable.)
- Batch creates a Generation Job: POST /templates/{id}/jobs with rows + ONE output format for the whole batch (png scale 1|2|3, jpeg quality, or pdf). Mixed formats = two batches.
- Optional client-supplied idempotency key on batch submit: a retried submit returns the existing Job instead of rendering twice.
- Completion signaling: POLLING ONLY in v1 — job-status endpoint with state + progress counts. Webhooks -> Frontier (needs callback URLs, signing, delivery retries; nothing blocks adding them later).

BATCH INPUT:
- Canonical format: JSON array of Row objects keyed by Variable name, natively typed.
- CSV accepted on the same endpoint as an alternate content type; the SERVER converts columns to typed values using the declared Variable types (boolean cells: literal true/false case-sensitive; number cells: JSON number grammar). Strict k77nv9 validation applies after conversion — the typing rules live once, server-side, not in each client.
- CSV empty cell = omitted for EVERY type (default applies; no default -> validation error). Explicit "" text requires JSON — CSV cannot express the distinction.
- Reserved _name field names the output file: charset [A-Za-z0-9._-], max 128 chars, unique within the batch; violations are submission-time validation errors. Rows without _name get the zero-padded row index; mixing named/unnamed rows is fine.

JOB LIFECYCLE:
- Submission validates ALL rows atomically: any invalid row rejects the entire batch with row-indexed named-Variable errors; nothing renders. Fix the data, resubmit.
- States: queued -> rendering -> completed | failed | canceled. 'completed' covers runs with per-row render failures — per-row statuses carry the detail; no separate completed_with_errors state.
- Render-time failures (e.g. dead image URL) fail only that row after ONE automatic retry for transient errors (fetch failure, timeout); the batch continues. Fleet-level retry/observability policy stays on the Frontier.
- Cancel endpoint: canceled is terminal; already-rendered rows stay retrievable, unrendered rows are marked skipped.

OUTPUT DELIVERY:
- Files land in app storage at jobs/{jobId}/{name}.{ext}; job status lists per-row URLs; one endpoint serves the whole batch as a zip.
- Retention: no auto-expiry — outputs live until an explicit delete-job call. Productized retention policy -> Frontier.

REASON: single-render stays one round-trip because the render is fast; everything batch-shaped goes through one Job resource so UI upload, API, and CLI are thin clients of the same contract; atomic submission validation extends k77nv9's fail-fast rule to the batch level (a batch either starts clean or not at all), while render-time row isolation keeps one dead URL from burning 999 good renders.
