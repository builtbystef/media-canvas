---
id: q44rtp
title: What does the batch generation UI look like?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - 8h50hu
parent: v1xa7j
created: 2026-08-14T05:55:13Z
updated: 2026-08-14T19:54:24Z
---

Interview the user (grill-me skill, limited to this question) to settle the in-app surface for batch generation — the Generation Channel "CSV/data-file upload in the UI" that the roadmap goal names. Node 8h50hu settled one-off generation (the Generate dialog in the editor) and explicitly excluded batch from it.

The contract is fully settled (spec 0egsmf) and this node designs UI over it, changing nothing underneath: POST /templates/{id}/jobs accepts JSON rows or text/csv (header row = Variable names, optional _name column); submission validates every Row atomically and rejects the whole batch with row-indexed, named-Variable errors; progress is polled via GET /jobs/{id} with per-Row statuses; outputs download per Row or as outputs.zip; cancel keeps finished Rows; delete removes everything.

Settle: where batch upload lives (a second tab of the Generate dialog, a jobs page per template, or a global jobs surface) and how it is reached; how a CSV is previewed and mapped against the Template's Variables before submission, and how row-indexed 422 errors are displayed for fixing; whether JSON paste is offered alongside CSV upload; what the job progress view shows while rendering (polling cadence, per-Row status list, failed-Row errors) and where a running job lives when the user navigates away; how outputs are retrieved (per-Row links, the zip button) and how cancel and delete are exposed, including confirms; and whether the job view surfaces that it rendered a snapshot when the Template has changed since submission.

Input: the generation platform spec 0egsmf (including the 8h50hu amendment note), node jgo8tv (contract decisions), node 8h50hu (Generate dialog, and what it deferred here).

## Notes

**claude** — 2026-08-14T19:54:13Z

ANSWER (settled by interview, user confirmed 2026-08-14). No new glossary terms — Generation Job, Row, and the Generate dialog already carry the vocabulary. One contract amendment recorded on spec 0egsmf: a GET /jobs list endpoint.

SURFACE SPLIT: submission lives in a "Batch" tab of the editor's Generate dialog; monitoring lives on a global Jobs page in the main navigation. The Batch tab appears only for templates — the contract's batch endpoints are template-only, so a design's Generate dialog stays the plain format picker from 8h50hu.

JOBS PAGE: lists every job across templates, newest first. Each row: template name, state, progress fraction (e.g. 812/1000, failed count shown when >0), output format, created time; clicking opens the job view. The list polls at 5 s while any visible job is non-terminal, else not at all. Requires the amendment: GET /jobs returns JobViews without the rows array, with the template's name denormalized in (one server-side join beats N client fetches).

JOB VIEW: its own route, /jobs/{id}, reached from the Jobs page — and landed on directly after submission (the dialog closes; no toast-and-stay, there is nothing left to do in the editor with that batch). A running job therefore lives at a stable URL and navigating away loses nothing. Polls GET /jobs/{id} every 2 s while queued/rendering, stops on a terminal state. Shows a progress bar from the counts, the counts themselves (succeeded / failed / skipped / remaining), and the per-Row status list with failed Rows surfaced first or one filter-click away, each with its named-Variable error. Each succeeded Row links directly to its output file (the contract's per-Row url); the header has a "Download all (.zip)" button enabled once the job is terminal with at least one success. No thumbnails — pointing <img> at hundreds of full-size outputs is the drag the Frontier derived-images item exists to avoid. SNAPSHOT LINE: when the template's updatedAt postdates the job's createdAt, one quiet line — "Rendered from a snapshot taken at {time}; the template has changed since." A deleted template makes the line say the template no longer exists; outputs are unaffected.

BATCH TAB: CSV upload only — no JSON paste in v1. The UI channel exists exactly for the no-JSON-tooling case (spec user story 8); anyone holding JSON is one curl away from the API. The tab shares the output-format picker with the one-off tab. On file pick the client parses the CSV read-only: a header-mapping summary against the Template's Variables (matched / missing-but-defaulted / missing-required / unknown column / _name) plus the parsed rows in a table. The preview checks shape only — cell-typing rules live server-side in core, so real validation stays the submission 422.

422 DISPLAY: errors land inline on the preview table — offending rows highlighted with their named-Variable messages, a jump-to-first-error control, and a count line ("14 rows invalid; nothing was submitted") — plus a compact list grouped by row index/_name above the table, since bad rows may be scattered through thousands. The fix loop under atomic rejection: edit the source file, re-upload, same preview.

CANCEL/DELETE: Cancel is a button on a running job's view; its confirm states the contract's semantics ("Stops rendering; the N finished renders are kept, the rest become skipped"). Delete appears only on terminal jobs; its confirm states "Permanently deletes this job and its M output files." Delete is absent on running jobs so no dialog has to explain cancel-then-delete.

IDEMPOTENCY: the Batch tab generates a random idempotencyKey when a file is parsed for preview and sends it with the submission; retrying the same prepared batch after a network failure reuses the key, so a flaky connection cannot double-render a thousand rows. Re-parsing or picking a new file rotates the key. Never shown in the UI.

CADENCE REASON: at ~166 ms/render a 1,000-row job finishes in ~3 minutes, so 2 s polling paints visibly moving progress without load; 5 s suffices for the list view.
