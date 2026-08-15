---
id: 047evd
title: 'Job output retrieval: per-Row links and the zip'
state: todo
priority: high
depends_on:
    - p45jd2
    - 211q1b
parent: wz3ev2
created: 2026-08-15T07:29:10Z
updated: 2026-08-15T07:29:10Z
---

## What to build

The files come down from the page that reports them. Each succeeded Row links to its own output at the address the server already handed over, and the whole job comes down as one archive from a single button in the header. Nothing here builds an address by hand and nothing receives a storage URL: every byte arrives through the api, which is what keeps a download subject to the same Workspace check as everything else.

## Acceptance criteria

- [ ] A succeeded Row links to its output at the address carried in the job's own response; the page never constructs that address itself.
- [ ] A Row that failed, was skipped, or has not finished offers no link. Worked example: a job with 812 succeeded and 6 failed shows 812 links and none on the failed Rows.
- [ ] Following a Row's link downloads that file with the content type of the job's output format.
- [ ] A header control downloads the whole job as one archive, and is enabled only when the job has reached a terminal state with at least one succeeded Row. Worked examples: rendering with 400 succeeded → disabled; completed with 0 succeeded → disabled; completed with 1 succeeded → enabled.
- [ ] The disabled control says why it is disabled rather than being silently inert.
- [ ] No storage URL, signed link, or credential appears anywhere in the page or its requests.
- [ ] A Viewer in the job's Workspace can use both routes out.
- [ ] The enablement rule is tested as pure logic over a job's state and counts.
