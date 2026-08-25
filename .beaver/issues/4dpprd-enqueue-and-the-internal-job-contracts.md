---
id: 4dpprd
title: Enqueue and the internal job contracts
state: done
assignee: agent
priority: high
depends_on:
    - kjsmdy
    - i3r0dx
parent: 0egsmf
created: 2026-08-15T06:54:35Z
updated: 2026-08-25T18:13:56Z
---

## What to build

A submitted Job becomes work. Each Row goes onto the queue as an identifier pair and nothing more — the queue carries the signal, the database carries the state. The api grows the three internal calls the worker will make: fetch a Job's snapshot and output format once, fetch one Row's values, and report a Row's outcome. Reporting the last outstanding Row is what completes the Job, recorded in the same transaction as the Row itself, so a Job can never look finished while a Row is still open, or the reverse.

## Acceptance criteria

- [ ] Submitting a batch enqueues exactly one task per Row, each carrying only the Job and Row identifiers — no values, no snapshot, no format.
- [ ] The internal calls require the shared internal credential, are refused without it, and are not part of the public versioned surface.
- [ ] The Job call returns the Template snapshot, the output format, and the Workspace; the Row call returns that Row's values, name, and index.
- [ ] Reporting a result records the Row's status, its error or the key of its stored output, and its finishing time, and in the same transaction completes the Job when no Row of it remains queued or rendering. Worked example: a five-Row Job with four succeeded and one failed, at the last report → the Job is completed, not failed, and the per-Row statuses carry the detail.
- [ ] A Job leaves the queued state when its first Row begins rendering, and stays running while any Row is outstanding. The carrier is the internal Row fetch: fetching a Row's values marks that Row rendering and stamps its start time in the same request, and the first such flip moves the Job to running — no separate call exists for the transition.
- [ ] Reporting the same Row twice neither double-counts it nor moves the Job backwards out of a terminal state.
- [ ] Tests drive the enqueue and the internal calls from outside: the queue is observed through its own contract, and the Job's state is read back through the polling route rather than by inspecting tables from the other side of a seam.

## Notes

**claude** — 2026-08-17T04:00:24Z

Decision 2026-08-16: the queued-to-rendering transition is carried by the internal Row fetch - fetching a Row marks it rendering and stamps its start time in the same request, and the first such flip moves the Job to running. No separate call exists for it.

**agent** — 2026-08-25T17:56:41Z

Seam: public HTTP (submit + GET /jobs/{id} polling) and the queue's own contract (BullMQ waiting jobs). Internal calls at GET/POST /internal/jobs/... . Job/Row state is read back through polling, not the tables. Queue payload is identifiers only.

**agent** — 2026-08-25T18:13:53Z

Built enqueue and the internal job contracts.

Submitting a batch now writes one BullMQ task per Row after the Job is committed. Payload is {jobId, rowId} only; attempts is 2 on the job options. Queue name is `rows` (prefix bull:rows), which is what the Node worker will consume.

Internal surface (include_in_schema=False, INTERNAL_API_TOKEN, session cookies refused):
- GET /internal/jobs/{jobId} → templateSnapshot, output, workspaceId
- GET /internal/jobs/{jobId}/rows/{rowId} → values, name, rowIndex. A queued Row is marked rendering and started_at is stamped in the same request; the first such flip moves the Job queued → rendering (the public state name; "running" in the issue prose).
- POST /internal/jobs/{jobId}/rows/{rowId}/result → records status, error or outputKey, finished_at. Same transaction completes the Job when no Row remains queued or rendering. A Job with mixed per-Row success/failure is completed, not failed. A second report of a terminal Row is a no-op and cannot move the Job backwards.

Decisions a reviewer should know:
- The producer writes BullMQ's Redis layout over RESP rather than importing the `bullmq` pip package. PyPI was unreachable in this session so the lockfile could not gain a new dependency; the interoperability contract the Node consumer actually reads is that layout (hash, wait list, marker, events, opts.attempts). Queue name and payload are the stable seam.
- workspaceId is on the Job fetch because the issue requires the Workspace and the worker needs it to load assets.
- Enqueue happens after commit, not on the 200 idempotent-retry path.
- Tests: apps/api/tests/test_job_queue.py. Queue observed via BullMQ wait-list keys; Job state via GET /jobs/{id}. Redis db 1 so the suite never drains a dev queue. CI now starts redis; the api compose service gets REDIS_HOST=redis.

Checks: pnpm check green. 137 api tests (pnpm --filter api test against the sandbox unix sockets / Garage) and 265 TS tests (vp test) green.
