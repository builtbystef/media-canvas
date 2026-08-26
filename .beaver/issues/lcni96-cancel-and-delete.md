---
id: lcni96
title: Cancel and delete
state: done
assignee: agent
priority: medium
depends_on:
    - dblx26
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-26T17:21:59Z
---

## What to build

Two ways a Job ends early. Cancelling stops the work that has not started and keeps everything already rendered: the finished files stay downloadable, and the Rows that never ran are marked skipped rather than failed, so a wrong batch stops costing money without losing what it produced. Deleting removes the Job outright, database records and stored files together — and it is the only way an output ever leaves storage, because nothing here expires on its own.

## Acceptance criteria

- [ ] Cancelling a running Job makes it canceled and marks every unfinished Row skipped. Worked example: two Rows succeeded and three queued at the moment of cancel → the Job is canceled, three Rows are skipped, and both finished files still download.
- [ ] Canceled is terminal: cancelling again changes nothing, and a result arriving late for a canceled Job is ignored rather than reviving it or its Job.
- [ ] A Row already rendering when the cancel lands leaves the Job's counts consistent however it finishes.
- [ ] Deleting a Job removes its records and every stored object under its prefix. Worked example: after deleting a Job with two stored outputs, nothing remains under its prefix, the Job and its Rows are gone, each file address answers not-found, and a neighbouring Job's files are untouched.
- [ ] Deletion is the only removal: nothing in the system expires or deletes an output on a schedule.
- [ ] Cancel and delete are Editor-level actions in the Job's Workspace; a Viewer is refused, and a caller outside the Workspace is refused in a way that does not reveal whether the Job exists.

## Notes

**agent** — 2026-08-26T17:21:59Z

Seam: public API (spec 0egsmf seam 1). Tests in apps/api/tests/test_job_end.py drive POST /jobs/{id}/cancel and DELETE /jobs/{id} through the FastAPI test client. Worker HTTP and the queue are stood in the same way as test_jobs.py; object storage is the real compose store. Succeeded Rows are arranged through the tables plus stored bytes. Late results arrive through the internal result contract.

Built
- POST /api/v1/jobs/{jobId}/cancel (Editor): Job → canceled, canceled_at stamped, every queued or rendering Row → skipped. Worked example: 2 succeeded / 3 queued → canceled, 3 skipped, both files still served.
- Canceled is terminal: a second cancel returns the same view. A late succeeded or failed result on a skipped Row is ignored; the Job stays canceled.
- A Row already rendering when cancel lands is skipped with the rest. Whether the worker later reports success or failure, progress stays skipped and the Job stays canceled.
- DELETE /api/v1/jobs/{jobId} (Editor, 204): Job and Rows go, then every object under {workspaceId}/jobs/{jobId}/. Neighbour Job files stay. File addresses and GET job answer 404.
- Outputs do not expire: after 400 days on the clock the file is still served. Delete is the only removal.
- Viewer is 403. An outsider gets the same 404 as a missing Job.
- Fetching a queued or skipped Row of a canceled Job answers 404 on the internal contract, so the worker treats the work as gone and does not render it.

Decisions
- Unfinished means queued and rendering. In-flight work is withdrawn rather than allowed to flip the Row after cancel; that is how counts stay consistent however the worker finishes.
- Cancel of a completed or failed Job is a no-op: it does not flip those states to canceled.
- Cancel and result serialize on SELECT FOR UPDATE of the Job and its Rows, so a late result cannot revive a Row cancel has already skipped.
- Records go first, prefix delete second (same order as image delete): a failed prefix delete leaves orphans, not a Job whose files are already gone.

Facts for a reviewer: pnpm check green. API pytest 167 passed against the compose Postgres, Redis, and Garage via the sandbox sockets / stack.local. vp test 372 passed. OpenAPI and the typed client regenerated (cancelJob, deleteJob).
