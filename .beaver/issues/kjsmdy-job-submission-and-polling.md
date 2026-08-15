---
id: kjsmdy
title: Job submission and polling
state: todo
priority: high
depends_on:
    - ilgj60
    - gxwr7t
    - sazdn4
    - qqzqhz
parent: 0egsmf
created: 2026-08-15T06:54:29Z
updated: 2026-08-15T07:13:26Z
---

## What to build

A batch of rows meets a Template and becomes a Generation Job — or the whole batch is refused and nothing exists. Submission validates every Row first, copies the Template into the Job so later edits and deletions cannot change what the batch renders, records one Row per input row, and answers with the Job. Polling afterwards shows the Job's state and how many Rows sit in each status, and a Workspace's Jobs list gives the newest first. A resubmission carrying an idempotency key that was already used returns the Job that exists rather than rendering everything twice.

The Template this route reads belongs to the editor spec (ek7pq1), which is not sliced yet; this issue's blocking edge points at that spec's umbrella. Retarget it to the slice that lands the documents table when that spec is sliced.

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
