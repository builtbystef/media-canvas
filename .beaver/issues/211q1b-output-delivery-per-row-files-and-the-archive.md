---
id: 211q1b
title: 'Output delivery: per-Row files and the archive'
state: todo
priority: high
depends_on:
    - dblx26
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-15T06:54:42Z
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
