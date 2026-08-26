---
id: uuyais
title: The Jobs page and list-level navigation
state: done
assignee: agent
priority: high
depends_on:
    - p45jd2
    - kjsmdy
parent: wz3ev2
created: 2026-08-15T07:29:10Z
updated: 2026-08-26T13:56:45Z
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

## Notes

**agent** — 2026-08-26T13:56:44Z

Built the Jobs page and the Documents | Jobs navigation the list-level pages share. `/jobs` lists the current Workspace's jobs newest first; each row is a link to `/jobs/{id}`. `pnpm check` green. 364 TS tests and 152 api tests green (api tests via the sandbox unix sockets).

**What landed.** `app/jobs/page.tsx` is the server page — session, `listJobs` for the chosen Workspace. `app/jobs/jobs-list.tsx` is the live list: polls every 5 s while any listed job is queued or rendering, stops once every listed job is terminal. `app/list-nav.tsx` is Documents | Jobs, mounted on the documents list and the jobs list only. Behaviour worth testing is in `lib/jobs.ts`. `JOBS` is in `lib/routes.ts`.

**Seam.** The spec's client pure-logic seam (Vitest, fake timers, no browser). Worked examples are literal: 812/6/0 of 1000 → 818/1000 with the failed count shown; no failures → no failed count; the last rendering job reporting completed issues no further request.

**Decisions a reviewer should know.**

- *List nav is not in the Shell.* The editor's top bar is unchanged. The job view keeps the Shell without Documents | Jobs — it is not a list-level page.
- *A deleted template is named "Generation Job".* `JobSummary.templateName` is null when the template is gone; the same fallback the job view uses.
- *No pagination, no per-Row detail.* The page renders the contract list as-is. Newest-first is the api's order.
- *A Viewer sees every row and may open any of them.* `listJobs` is already Viewer-level; this page adds no write actions.
- *Workspace switch remounts the list* via `key={workspaceId}` so a job from another Workspace never appears.

**Testing.** `lib/jobs.test.ts` (4).
