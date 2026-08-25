---
id: 211q1b
title: 'Output delivery: per-Row files and the archive'
state: done
assignee: agent
priority: high
depends_on:
    - dblx26
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-25T19:09:13Z
---

## What to build

The files a batch produced come back out. Each succeeded Row is served at a stable address built from its Job and its own name, and the whole Job comes down as one archive of every succeeded Row. The api streams the bytes from its own storage, so a client never receives a storage URL or a credential. Once a Row has an output, the Job view carries its address — which is what makes retrieval scriptable from the polling response alone.

## Acceptance criteria

- [ ] A succeeded Row's file is served with the content type of the Job's output format, at an address derived from the Job and the Row's name, and that address does not change afterwards.
- [ ] The Job view carries each succeeded Row's address, and only those: a Row that failed, was skipped, or has not finished carries none, and its would-be address answers not-found.
- [ ] The archive holds one entry per succeeded Row, each named for the Row with the format's extension, and is streamed rather than assembled in memory. Worked example: a Job with two succeeded Rows and one failed → an archive of exactly two entries.
- [ ] An archive of a Job with no succeeded Rows is a valid, empty archive rather than an error.
- [ ] Any member of the Job's Workspace may download either way; a caller outside it is refused in a way that does not reveal whether the Job exists.
- [ ] Downloads are proxied: no storage URL, credential, or signed link ever reaches a client, and no download path bypasses the Workspace check.

## Notes

**agent** — 2026-08-25T18:57:03Z

Seam: public API (spec 0egsmf seam 1). Tests in apps/api/tests/test_job_outputs.py drive GET /jobs/{id}, GET /jobs/{id}/outputs/{name}.{ext}, and GET /jobs/{id}/outputs.zip through the FastAPI test client. Worker HTTP and the queue are stood in the same way as test_jobs.py; object storage is the real compose store. Row success is arranged through the tables (the public surface cannot produce a succeeded Row by itself). No storage URL or credential is asserted against the responses.

**agent** — 2026-08-25T19:09:08Z

Seam: public API (spec 0egsmf seam 1). Tests in apps/api/tests/test_job_outputs.py.

Built
- JobView.url is /api/v1/jobs/{id}/outputs/{name}.{format} for succeeded Rows only; failed, skipped, and unfinished Rows carry none.
- GET /api/v1/jobs/{jobId}/outputs/{name}.{ext} streams the Row's stored bytes with the Job's output content type (png/jpeg/pdf), not the type the store recorded. A would-be address — unfinished, failed, skipped, unknown name, or the wrong extension — is 404.
- GET /api/v1/jobs/{jobId}/outputs.zip streams one zip entry per succeeded Row, named {name}.{format}, in row-index order. Worked example: two succeeded + one failed → two entries. A Job with no succeeded Rows answers a valid empty zip.
- Both routes go through holding_job(viewer): any member downloads; an outsider gets the same 404 as a missing Job. Bytes leave only through serve / serve_archive — no storage URL, credential, or signed link.

Decisions
- Address is derived from Job id + Row name + the Job's format, so it is stable after the first success.
- Zip uses stdlib zipfile (ZIP_STORED) written into a chunked sink; no new dependency. The spec allowed a zip library; coding standards prefer the stdlib.
- A succeeded Row whose object is missing is omitted from the archive rather than failing the whole download.

Facts for a reviewer: pnpm check green. Worker/TS vitest 274 passed. API pytest 152 passed against the compose Postgres and Garage via the sandbox sockets / stack.local. OpenAPI and the typed client regenerated (getJobOutput, getJobArchive).
