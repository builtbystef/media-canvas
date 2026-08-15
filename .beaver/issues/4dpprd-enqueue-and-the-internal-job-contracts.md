---
id: 4dpprd
title: Enqueue and the internal job contracts
state: todo
priority: high
depends_on:
    - kjsmdy
    - i3r0dx
parent: 0egsmf
created: 2026-08-15T06:54:35Z
updated: 2026-08-15T06:54:35Z
---

## What to build

A submitted Job becomes work. Each Row goes onto the queue as an identifier pair and nothing more — the queue carries the signal, the database carries the state. The api grows the three internal calls the worker will make: fetch a Job's snapshot and output format once, fetch one Row's values, and report a Row's outcome. Reporting the last outstanding Row is what completes the Job, recorded in the same transaction as the Row itself, so a Job can never look finished while a Row is still open, or the reverse.

## Acceptance criteria

- [ ] Submitting a batch enqueues exactly one task per Row, each carrying only the Job and Row identifiers — no values, no snapshot, no format.
- [ ] The internal calls require the shared internal credential, are refused without it, and are not part of the public versioned surface.
- [ ] The Job call returns the Template snapshot, the output format, and the Workspace; the Row call returns that Row's values, name, and index.
- [ ] Reporting a result records the Row's status, its error or the key of its stored output, and its finishing time, and in the same transaction completes the Job when no Row of it remains queued or rendering. Worked example: a five-Row Job with four succeeded and one failed, at the last report → the Job is completed, not failed, and the per-Row statuses carry the detail.
- [ ] A Job leaves the queued state when its first Row begins rendering, and stays running while any Row is outstanding.
- [ ] Reporting the same Row twice neither double-counts it nor moves the Job backwards out of a terminal state.
- [ ] Tests drive the enqueue and the internal calls from outside: the queue is observed through its own contract, and the Job's state is read back through the polling route rather than by inspecting tables from the other side of a seam.
