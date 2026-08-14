---
id: wz3ev2
title: Batch generation UI
state: todo
labels:
    - spec
depends_on:
    - q44rtp
created: 2026-08-14T20:23:27Z
updated: 2026-08-14T20:23:27Z
---

## Problem Statement

The generation platform can render a thousand Rows from a CSV, and the editor can author the Template — but the Generation Channel "CSV upload in the UI" has no surface. There is no way to upload a data file against a Template without leaving the app, no place to watch a Generation Job progress, no way to fetch its outputs, and no way to cancel a wrong batch or delete a finished one.

## Solution

Two surfaces over the existing contract, changing nothing underneath. Submission lives in a "Batch" tab of the editor's Generate dialog (templates only): pick a CSV, see a read-only preview that maps its columns against the Template's Variables, submit, and land directly on the job's own page. Monitoring lives on a global Jobs page in the app's navigation: every job across templates, newest first, with a job view per job showing live progress, per-Row statuses with named-Variable errors, per-Row downloads and a zip, cancel and delete with plain-language confirms, and a quiet line when the Template has changed since the snapshot was taken. The whole thing is a pure client of the generation platform spec (0egsmf) as amended.

## User Stories

1. As a batch operator, I want a Batch tab in a template's Generate dialog that accepts a CSV, so that batch generation needs no JSON tooling.
2. As a batch operator, I want a preview that maps my CSV's columns against the Template's Variables before submission, so that shape mistakes surface before the server sees them.
3. As a batch operator, I want a rejected submission's row-indexed errors displayed on that same preview, so that the fix loop is edit-the-file, re-upload, resubmit.
4. As a batch operator, I want to land on the job's page immediately after submission, so that progress is visible and navigating away loses nothing.
5. As a batch operator, I want a global Jobs page listing every job across templates, so that one place holds everything running or finished.
6. As a batch operator, I want the job view to show live counts and per-Row statuses with each failure's named-Variable error, so that I know what succeeded without downloading anything.
7. As a batch operator, I want per-Row output links and one zip button, so that retrieval matches the size of what I need.
8. As a batch operator, I want cancel to state that finished renders are kept and delete to state what it destroys, so that no destructive action is a surprise.
9. As a batch operator, I want the job view to say when it rendered from a snapshot the Template has since outgrown, so that stale output is recognizable.
10. As a batch operator, I want retrying a failed submission to never render twice, so that a flaky connection cannot double-render a thousand Rows.

## Implementation Decisions

### Routes and navigation

- Two new routes in the web app, siblings of the document list: the Jobs page at a global jobs route, and the job view at a per-job route (`/jobs/{id}`).
- A minimal top navigation on the list-level pages — Documents | Jobs. The editor's top bar is unchanged; a job view is reached from the Jobs page, or landed on directly after submission.

### Jobs page

- Backed by the amended contract's `GET /api/v1/jobs` — JobView minus the `rows` array, plus `templateName` denormalized in, newest first, unpaginated.
- One row per job: template name, state, progress fraction (e.g. 812/1000, with the failed count shown when > 0), output format, created time. Clicking opens the job view.
- Polls every 5 s while any listed job is non-terminal; does not poll otherwise.

### Job view

- Polls `GET /api/v1/jobs/{id}` every 2 s while the job is `queued` or `rendering`; stops on a terminal state.
- Shows a progress bar derived from the counts, the counts themselves (succeeded / failed / skipped / remaining), and the per-Row status list.
- **Row list**: natural row order, virtualized. Status filter chips with counts above the list (All / Failed / Succeeded / Skipped / Queued); the failed count in the summary is clickable and applies the Failed filter. A failed Row shows its named-Variable error inline; a succeeded Row links directly to its output file (the contract's per-Row `url`). No thumbnails.
- **Download all (.zip)**: a header button pointing at the contract's zip endpoint, enabled once the job is terminal with at least one success.
- **Snapshot line**: the view fetches `GET /api/v1/documents/{templateId}` once (never polled) and compares its `updatedAt` to the job's `createdAt`. If the template is newer: "Rendered from a snapshot taken at {createdAt}; the template has changed since." A 404 makes the line say the template no longer exists. Outputs are unaffected either way.
- **Cancel**: a button while the job is `queued`/`rendering`; the confirm states the contract's semantics — "Stops rendering; the N finished renders are kept, the rest become skipped." Calls the cancel endpoint.
- **Delete**: appears only on terminal jobs, so no dialog ever explains cancel-then-delete; the confirm states "Permanently deletes this job and its M output files." On success, navigate to the Jobs page.

### Batch tab

- A second tab of the editor's Generate dialog, appearing only when the open document is `kind: 'template'` — the batch endpoints are template-only, so a design's dialog stays the plain format picker. The one-off tab remains the dialog's default tab; the dialog remembers nothing between opens. The tab shares the output-format picker (PNG scale 1/2/3, JPEG quality, PDF) with the one-off tab.
- **CSV only** — no JSON paste. On file pick, the client parses the CSV (Papa Parse) into a read-only preview: a header-mapping summary against the Template's Variables — matched / missing-but-defaulted / missing-required / unknown column / `_name` recognized — plus the parsed rows in a virtualized table. The preview checks shape only; cell-typing rules live server-side in core, so the submission 422 remains the only real validation. Submit stays enabled even when the summary shows missing-required or unknown columns — the summary warns, the server's 422 is the only gate (the project's warn-here-reject-there split).
- **Submission**: the raw file bytes as `Content-Type: text/csv` to `POST /api/v1/templates/{id}/jobs`, with the output format and idempotency key as flat query parameters per the 0egsmf amendment (`?format=png&scale=2` | `?format=jpeg&quality=90` | `?format=pdf`, plus `&idempotencyKey=...`). The client never submits client-typed JSON. On 201 (or 200 for an idempotent replay) the dialog closes and the app navigates to the job view.
- **422 display**: errors land inline on the preview table — offending rows highlighted with their named-Variable messages, a jump-to-first-error control, and a count line ("14 rows invalid; nothing was submitted") — plus a compact list grouped by row index/`_name` above the table, since bad rows may be scattered through thousands. The fix loop under atomic rejection: edit the source file, re-upload, same preview.
- **Idempotency**: a random `idempotencyKey` is generated when a file is parsed for preview and sent with the submission; retrying the same prepared batch after a network failure reuses it. Re-parsing or picking a new file rotates the key. It is never shown in the UI.

### Contract

No server surface is added or changed by this spec. Its three server-side counterparts are already recorded as amendments on the generation platform spec 0egsmf: the `POST /documents/{id}/render` generalization (node 8h50hu), the `GET /api/v1/jobs` list endpoint (node q44rtp), and the query-parameter carrier for the CSV variant's output format and idempotency key (node p1fkjl). Their implementation and API-seam tests belong to 0egsmf.

## Dependencies

- **papaparse** — in-browser CSV parsing for the preview. The preview's row boundaries must not disagree with the server's parse, and quoting/newline edge cases are exactly where hand-rolled parsers drift.
- **@tanstack/react-virtual** — virtualizes the CSV preview table and the job view's Row list; headless, fits the existing React/Tailwind/shadcn stack; one shared table treatment with no "showing first N" caveats.

No other dependency may be added by an implementation session without amending this section.

## Testing Decisions

Two seams, agreed:

1. **Client pure logic** (Vitest, no browser — the same seam style as the editor spec's store operations). Worked examples: a CSV with headers `title,price,_name` against Variables `title` (text, required), `price` (number, default 0), `accent` (color, default) → mapping summary: matched `title`/`price`, missing-but-defaulted `accent`, `_name` recognized, no unknowns; an extra `notes` header → unknown column; no `title` header → missing-required; a 422 body `[{rowIndex: 3, variable: 'price', message}]` merged into the preview → row 3 highlighted with the message and the count line reads "1 row invalid; nothing was submitted"; snapshot predicate — template `updatedAt` after job `createdAt` → line shown, template 404 → deleted variant, otherwise no line; idempotency key — retry of the same prepared batch keeps the key, re-parse rotates it. Polling cadence logic (2 s / 5 s, stop on terminal) is tested here with fake timers, not in e2e.
2. **One Playwright e2e ride-along** against the real dev stack: open a template, Generate → Batch tab, upload a small CSV, see the mapping summary, submit, land on the job view, poll to `completed`, download one per-Row output and the zip. One scripted pass — fine-grained behavior lives at seam 1.

External behavior only at both seams. Server behavior (validation, idempotent replay, cancel semantics, the jobs list) is already covered by 0egsmf's seam 1 and is not re-tested here. Prior art: the editor spec's seam 1 and e2e smoke are the models.

## Out of Scope

- JSON paste in the batch UI — CSV-only; anyone holding JSON is one curl away from the API (node q44rtp).
- An editable data grid in the preview — read-only shape check; fixes happen in the source file (node q44rtp).
- Output thumbnails in the job view — the same derived-image cost the Frontier item defers (node q44rtp).
- Per-template jobs pages — one global Jobs page (node q44rtp).
- Delete on a non-terminal job — cancel first (node q44rtp).
- Webhooks, pagination on the jobs list, auth — Frontier, per 0egsmf.
- Everything 0egsmf owns server-side, including the three amendments' implementation.

## Further Notes

- Cadence rationale: at ~166 ms/render a 1,000-Row job finishes in ~3 minutes, so 2 s polling paints visibly moving progress without load; 5 s suffices for the list.
- The Batch tab and job view surface the contract's vocabulary as-is: Generation Job, Row, `_name`, per-Row statuses. No new glossary terms (node q44rtp).
- `GET /jobs/{id}` returns the full `rows` array every poll; at 1,000 Rows that is on the order of 100 KB every 2 s, which is fine for v1 and is why no partial-rows endpoint was added.
