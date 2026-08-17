---
id: vvdarf
title: The batch UI end-to-end smoke
state: todo
priority: medium
depends_on:
    - 39y4fh
    - 047evd
    - thh7aw
    - aw1dup
parent: wz3ev2
created: 2026-08-15T07:29:20Z
updated: 2026-08-17T03:56:03Z
---

## What to build

One pass through the whole thing, driven the way an operator drives it, against the real stack rather than stand-ins. A template is opened, a small CSV is uploaded and previewed, the batch is submitted, the job's page is watched until it completes, and both ways out — one file and the archive — are taken. It proves that this spec's client and the generation platform underneath it agree about formats, query parameters, addresses, and states; everything finer than that is already covered by the pure-logic tests.

## Acceptance criteria

- [ ] One browser-driven test runs against a running development stack: open a template, open the generate dialog's batch tab, upload a two-row CSV, see the mapping summary, submit, land on the job's page, watch it reach completed, download one Row's output, and download the archive.
- [ ] The archive downloaded by that test holds two entries.
- [ ] The test asserts on what is visible and what was downloaded, never on internal state.
- [ ] It is not part of the ordinary test command, and the project's documentation says how to run it and what must be running first.
- [ ] It was executed against a real stack in the session that closes this issue, with its output reported rather than assumed.
