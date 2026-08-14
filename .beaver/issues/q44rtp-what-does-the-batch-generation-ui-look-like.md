---
id: q44rtp
title: What does the batch generation UI look like?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - 8h50hu
parent: v1xa7j
created: 2026-08-14T05:55:13Z
updated: 2026-08-14T05:55:13Z
---

Interview the user (grill-me skill, limited to this question) to settle the in-app surface for batch generation — the Generation Channel "CSV/data-file upload in the UI" that the roadmap goal names. Node 8h50hu settled one-off generation (the Generate dialog in the editor) and explicitly excluded batch from it.

The contract is fully settled (spec 0egsmf) and this node designs UI over it, changing nothing underneath: POST /templates/{id}/jobs accepts JSON rows or text/csv (header row = Variable names, optional _name column); submission validates every Row atomically and rejects the whole batch with row-indexed, named-Variable errors; progress is polled via GET /jobs/{id} with per-Row statuses; outputs download per Row or as outputs.zip; cancel keeps finished Rows; delete removes everything.

Settle: where batch upload lives (a second tab of the Generate dialog, a jobs page per template, or a global jobs surface) and how it is reached; how a CSV is previewed and mapped against the Template's Variables before submission, and how row-indexed 422 errors are displayed for fixing; whether JSON paste is offered alongside CSV upload; what the job progress view shows while rendering (polling cadence, per-Row status list, failed-Row errors) and where a running job lives when the user navigates away; how outputs are retrieved (per-Row links, the zip button) and how cancel and delete are exposed, including confirms; and whether the job view surfaces that it rendered a snapshot when the Template has changed since submission.

Input: the generation platform spec 0egsmf (including the 8h50hu amendment note), node jgo8tv (contract decisions), node 8h50hu (Generate dialog, and what it deferred here).
