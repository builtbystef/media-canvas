---
id: p45jd2
title: 'The job view: live progress and the Row list'
state: todo
priority: high
depends_on:
    - hg52gb
    - kjsmdy
parent: wz3ev2
created: 2026-08-15T07:29:00Z
updated: 2026-08-15T07:29:00Z
---

## What to build

A submitted batch becomes something you can watch. A job has its own page, which refreshes itself while there is anything left to render and goes quiet the moment the job ends. It shows how far along the batch is, how many Rows landed in each status, and the Rows themselves in the order they were submitted — a failure carrying the error that names the Variable at fault, so a thousand-Row batch is diagnosable without downloading anything. The list is virtualized, because a thousand Rows is the ordinary case rather than the extreme one.

## Acceptance criteria

- [ ] A job has its own page, reached by its id, showing the job's state, its output format, and its template's name.
- [ ] The page refreshes itself every 2 seconds while the job is queued or rendering, and stops for good when the job reaches a terminal state. Worked example: a job that reports completed on its fourth refresh issues no fifth request, and none afterwards.
- [ ] Progress is derived from the counts the server returns rather than accumulated across refreshes, so a missed or reordered response cannot skew it. Worked example: 1000 Rows with 812 succeeded, 6 failed and 0 skipped → the bar reads 818 of 1000 finished, and the counts read succeeded 812, failed 6, skipped 0, remaining 182.
- [ ] The Rows are listed in submission order with each Row's name and status, and the list is virtualized: a 1000-Row job scrolls to the last Row with only the visible window in the document, and there is no "showing the first N" caveat anywhere.
- [ ] A failed Row shows its error inline, naming the Variable at fault; a Row that is queued, skipped or succeeded reads plainly with no error.
- [ ] Status chips above the list — all, succeeded, failed, skipped, queued — carry their counts and filter the list to that status. Worked example: with the counts above, the failed chip reads 6 and selecting it leaves exactly 6 Rows listed.
- [ ] The failed count in the summary is itself the control that applies the failed filter.
- [ ] No output is previewed as an image anywhere on the page.
- [ ] Any member of the job's Workspace may open the page, a Viewer included; a job outside the caller's Workspace is refused in a way that does not distinguish it from one that never existed.
- [ ] The refresh cadence and the derivation of progress and counts are tested as pure logic with controlled time, not through a browser.
- [ ] The virtualization library named in the spec is the only dependency this slice adds.
