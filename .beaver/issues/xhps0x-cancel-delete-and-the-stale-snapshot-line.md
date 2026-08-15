---
id: xhps0x
title: Cancel, delete, and the stale-snapshot line
state: todo
priority: medium
depends_on:
    - p45jd2
    - uuyais
    - lcni96
    - qqzqhz
parent: wz3ev2
created: 2026-08-15T07:29:16Z
updated: 2026-08-15T07:29:16Z
---

## What to build

The two ways a batch ends, and one honest sentence about what it was rendered from. Cancel is offered only while there is work left to stop, and its confirm says plainly that finished renders survive it. Delete is offered only once the job has ended, so no dialog ever has to explain cancelling first, and its confirm names how many files it is about to destroy. Separately, a job that rendered from a snapshot its template has since outgrown says so — because output that no longer matches the template it names is the kind of thing someone discovers far too late.

## Acceptance criteria

- [ ] Cancel is offered while the job is queued or rendering, and not once it is terminal. Its confirm states the outcome with the job's real numbers: the finished renders are kept and the rest become skipped. Worked example: 812 succeeded at the moment of the confirm → the confirm names 812 kept renders.
- [ ] Confirming cancel leaves the page showing the canceled job and its skipped Rows, with the refreshing stopped, without a reload.
- [ ] Delete is offered only on a terminal job, so no dialog ever describes cancelling and deleting together. Its confirm names what it destroys: the job and its N output files. Worked example: a completed job with 812 succeeded Rows → the confirm names 812 files.
- [ ] Confirming delete returns to the jobs page, where the deleted job is no longer listed.
- [ ] Neither action is offered to a Viewer, and a refusal from the server is reported plainly rather than assumed impossible.
- [ ] The job's template is fetched once when the page opens and never on a refresh.
- [ ] A template last updated after the job was created produces a line saying the job rendered from a snapshot taken at the job's creation time and the template has changed since. Worked examples: template updated after the job's creation → the line, naming that time; template updated before it → no line; the template no longer exists → a line saying so instead.
- [ ] The line is informational only: it changes nothing about the outputs, the downloads, or the actions available.
- [ ] The rule that chooses between the three outcomes is tested as pure logic over the template's state and the job's creation time.
