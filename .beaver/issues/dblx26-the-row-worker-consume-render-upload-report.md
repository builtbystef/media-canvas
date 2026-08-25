---
id: dblx26
title: 'The Row worker: consume, render, upload, report'
state: done
assignee: agent
priority: high
depends_on:
    - 1dxm2u
    - 92zwes
    - 4dpprd
parent: 0egsmf
created: 2026-08-15T06:54:35Z
updated: 2026-08-25T18:51:11Z
---

## What to build

The queue's other end. A worker takes a Row task, fetches what it needs, renders it through the same pooled pages the synchronous path uses, uploads the file to object storage under that Job's own prefix, and reports the outcome. A transient failure — a fetch that times out — is retried once automatically; a failure caused by the Row's own values is not retried at all, because the second attempt would fail identically. One bad Row costs one Row, and the other nine hundred and ninety-nine finish.

## Acceptance criteria

- [ ] A task carrying only identifiers ends with the file in storage and the outcome reported. Worked example: a one-Row Job in png whose Row is named `hero` → the object is stored inside the Workspace's scope, under that Job's prefix, named for the Row with the format's extension, and the reported outcome names that same key.
- [ ] The Job's snapshot and format are fetched once per Job and reused across that Job's Rows, rather than once per task.
- [ ] Eight Rows render concurrently, through the one page pool that also serves the synchronous render call.
- [ ] A transient failure is retried exactly once, then reported failed. Worked example: an image fetch that times out on the first attempt and succeeds on the second → the Row succeeds, with two attempts recorded.
- [ ] A failure caused by the Row's values is reported failed immediately with its named-Variable error and consumes no retry.
- [ ] A Row that fails leaves its Job's other Rows untouched, and the Job still reaches completed once the rest finish.
- [ ] The worker holds no database client: everything it learns and everything it reports goes through the internal calls.
- [ ] A result report answered with 404 — the Row, its Job, or its Workspace was deleted while the render ran — is acknowledged as final: the task completes without retry and the worker moves on, so deleting a Workspace mid-render never wedges the queue (the deployment spec 88v6vg states this behavior; it lives here).
- [ ] Tests drive the consumer with the api's internal contract and object storage both stood in, covering the happy path with its stored key, the retried transient failure, and the non-retried value failure.

## Notes

**agent** — 2026-08-25T18:35:15Z

Seam: worker queue consumer (spec 0egsmf seam 3). Tests in apps/worker/src/row-consumer.test.ts drive createRowConsumer.process() against a faked HTTP internal api (GET job, GET row, POST result) and an in-memory output store. The page pool is stood in the same way as internal-render.test.ts. Retry is classified here (AssetFetchError retryable, ValueRefusal not); BullMQ's attempts: 2 re-invokes process(). Redis is not in this seam — CI's unit job has none.

**agent** — 2026-08-25T18:51:04Z

Seam: worker queue consumer (spec 0egsmf seam 3). Tests in apps/worker/src/row-consumer.test.ts drive createRowConsumer.process() against a faked HTTP internal api and an in-memory output store. The page pool is stood in. Redis is not in this seam — CI's unit job has none.

Built
- createRowConsumer.process({jobId, rowId, attempt, maxAttempts}): fetch Job (cached, in-flight coalesced) and Row over the internal contract, renderDocument through the shared page pool, PutObject at {workspaceId}/jobs/{jobId}/{name}.{ext}, POST the result.
- Worked example: Row `hero` in png → key `{workspaceId}/jobs/{jobId}/hero.png`, report names that key.
- AssetFetchError (fetch failure / timeout) is retryable: attempt 1 throws without reporting; attempt 2 reports and throws. ValueRefusal reports failed with the named-Variable error and is not retried.
- A 404 from any internal call (Job, Row, or result) completes the task without retry.
- Eight concurrent process() calls share PAGE_POOL_SIZE; index.ts hands the same pool to the internal HTTP service and the consumer.
- Queue loop speaks the BullMQ Redis layout the api already writes (queue `rows`, payload {jobId, rowId}, attempts 2): BLMOVE wait→active, one retry via LPUSH, no second library. Outputs go over path-style SigV4 PutObject. npm registry was unreachable, so bullmq and @aws-sdk/client-s3 were not added — same constraint that made 4dpprd write the producer in RESP.
- Compose worker now receives Redis, Garage credentials, and STORAGE_ENDPOINT, and waits for garage.

Decisions
- Retry classification lives in the consumer; the queue loop re-invokes process() with attempt 2. Tests observe two asset fetches, not generation_rows.attempts (the result contract has no such field; 4dpprd did not wire the column).
- A 404 on GET Job/Row is treated like a 404 on the result report: deleting a Workspace must not wedge the queue.
- Worker still holds no database client.

Facts for a reviewer: pnpm check green. Worker vitest 71 passed. API pytest 144 passed against the compose Postgres via the sandbox unix socket.
