---
id: uuyais
title: The Jobs page and list-level navigation
state: todo
priority: high
depends_on:
    - p45jd2
    - kjsmdy
parent: wz3ev2
created: 2026-08-15T07:29:10Z
updated: 2026-08-15T07:29:10Z
---

## What to build

One place holds everything that has run. A jobs page sits beside the documents, reachable from a small navigation the list-level pages share, and lists the current Workspace's jobs newest first — enough of each to know what it was and how far it got, and a click to the job's own page. It refreshes only while something on it is still moving, so an idle page is an idle browser.

## Acceptance criteria

- [ ] The list-level pages carry a navigation between the documents and the jobs; the editor's own top bar is unchanged by this slice.
- [ ] The jobs page lists the current Workspace's jobs, newest first, with no pagination and no per-Row detail.
- [ ] Each entry shows the template's name, the job's state, its progress as a fraction, its output format, and when it was created. Worked example: a job of 1000 Rows with 812 succeeded, 6 failed and 0 skipped reads 818/1000, and its failed count is shown because it is above zero; a job with no failures shows no failed count at all.
- [ ] Opening an entry opens that job's page.
- [ ] The page refreshes every 5 seconds while at least one listed job is non-terminal, and issues no requests at all once every listed job is terminal. Worked example: the last rendering job reports completed → no further request is made.
- [ ] Switching Workspace switches which jobs are listed; a job belonging to another Workspace never appears.
- [ ] A Workspace with no jobs shows a plain empty state rather than an error or a blank page.
- [ ] A Viewer sees the page and may open any job on it.
- [ ] The refresh rule is tested as pure logic with controlled time.
