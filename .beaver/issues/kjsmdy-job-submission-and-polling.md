---
id: kjsmdy
title: Job submission and polling
state: done
assignee: agent
priority: high
depends_on:
    - ilgj60
    - gxwr7t
    - sazdn4
    - qqzqhz
parent: 0egsmf
created: 2026-08-15T06:54:29Z
updated: 2026-08-25T17:49:49Z
---

## What to build

A batch of rows meets a Template and becomes a Generation Job — or the whole batch is refused and nothing exists. Submission validates every Row first, copies the Template into the Job so later edits and deletions cannot change what the batch renders, records one Row per input row, and answers with the Job. Polling afterwards shows the Job's state and how many Rows sit in each status, and a Workspace's Jobs list gives the newest first. A resubmission carrying an idempotency key that was already used returns the Job that exists rather than rendering everything twice.

## Acceptance criteria

- [ ] Submitting Rows against a Template stores a Job and one Row per input row, all queued, with the Template's document copied into the Job. Worked example: editing or deleting that Template afterwards changes nothing about the Job, its snapshot, or its Rows.
- [ ] Any invalid Row refuses the whole batch: no Job and no Rows are stored, and the response carries one error per problem with its row index and the Variable at fault. Worked example: three Rows where the second omits a required Variable → 422 naming row index 1 and that Variable, and no Job exists afterwards.
- [ ] A Row may name itself. Names allow letters, digits, dot, dash, and underscore, run to at most 128 characters, and are unique within the batch; a violation is refused at submission. A Row with no name takes its zero-padded row index. Worked example: two Rows both named `hero` → 422, nothing stored.
- [ ] Resubmitting with an idempotency key already used for that Template returns the existing Job and creates nothing; a fresh key creates a new Job. The two answers are distinguishable by status code.
- [ ] One output format covers the whole Job — png with a scale, jpeg with an optional quality, or pdf. Mixing formats means submitting twice.
- [ ] Polling a Job returns its state, its output format, the count of Rows in each status, and one entry per Row with index, name, status, and its error where it has one. The counts are computed from the Rows themselves rather than kept in columns, so they cannot drift from them.
- [ ] A Workspace's Jobs list returns that Workspace's Jobs newest first, without per-Row detail, with the Template's name included, and unpaginated.
- [ ] Submission is an Editor-level action; reading a Job and the list is open to any member; a caller outside the Workspace is refused in a way that does not reveal whether the Job exists.
- [ ] Tests drive the routes with the worker's validation contract stood in and the queue absent, asserting in particular that a refused batch leaves no rows behind.

## Notes

**claude** — 2026-08-15T07:13:26Z

Retargeted 2026-08-15 (ek7pq1 issue-slicing session): the placeholder edge on the ek7pq1 umbrella is replaced by edges on the slices that actually gate this work. No umbrella edges remain anywhere in the tracker.

**claude** — 2026-08-17T04:00:24Z

Cross-reference 2026-08-16: the queued-to-rendering transition that polling reflects is carried by the internal Row fetch, decided on 4dpprd.

**agent** — 2026-08-25T17:35:34Z

Seam: the spec's public API (FastAPI test client). The worker's /validate is stood in behind its contract (RecordingWorker); the queue is absent (4dpprd enqueues). Leftover rows after a refused batch, and the Template snapshot after an edit or delete, are read from the tables — neither is on the public JobView.

**agent** — 2026-08-25T17:49:49Z

Built job submission and polling. POST /api/v1/templates/{templateId}/jobs validates every Row through the worker, snapshots the Template, and stores a queued Job plus one Row per input — or refuses the whole batch and writes nothing. GET /api/v1/jobs/{jobId} polls state, output, per-Row entries, and progress counted from the Rows. GET /api/v1/workspaces/{workspaceId}/jobs lists that Workspace's Jobs newest first, without per-Row detail, with templateName from a left join. The queue is absent (4dpprd enqueues). OpenAPI and the generated client are regenerated.

Decisions a reviewer should know:
- template_id is lineage only, not a foreign key. The spec's schema called it a FK, but the first criterion's worked example requires deleting the Template to leave the Job, its snapshot, its Rows, and the templateId it was submitted against unchanged. ON DELETE SET NULL would change templateId; CASCADE would delete the Job; RESTRICT would refuse the delete.
- A refused batch answers 422 { errors, templateErrors }. The public contract named only errors; gxwr7t added templateErrors so a broken Template is never read as bad Rows, and folding those into RowError would undo that. Both lists are always present on this envelope (a clean refusal of names-only problems has templateErrors: []). FastAPI's own 422 (bad output format, empty rows) stays the framework shape.
- Unnamed Rows take str(index).zfill(width of the last index), so 11 Rows become 00–10. Names are unique after defaults are assigned, so a caller-supplied "0" colliding with the first unnamed Row is a 422.
- JPEG quality defaults to 90 and is held to 1–100. One output object per Job; a second format is a second submission.
- Idempotency is UNIQUE (template_id, idempotency_key). 201 for a new Job, 200 for a repeated key on that Template (payload is not compared). A concurrent insert that loses the unique race rolls back and returns the winner as 200.
- Submission is Editor-or-above via holding_template; GET job and the list are Viewer. An outsider gets the same 404 as a missing id ("No such template." / "No such job." / "No such workspace.").
- Tests: apps/api/tests/test_jobs.py, public HTTP seam, RecordingWorker, no queue. Leftover rows after a refusal, and the snapshot after an edit or delete, are read from the tables.

Checks: pnpm check green. 131 api tests (pnpm --filter api test against the sandbox unix socket / Garage) and 265 TS tests (vp test) green. pnpm build regenerated openapi.json and the client; the web Next build failed fetching Geist from Google Fonts in this sandbox, which is unrelated.
