---
id: lcni96
title: Cancel and delete
state: todo
priority: medium
depends_on:
    - dblx26
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-15T06:54:42Z
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
