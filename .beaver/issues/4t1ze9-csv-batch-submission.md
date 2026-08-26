---
id: 4t1ze9
title: CSV batch submission
state: done
assignee: agent
priority: medium
depends_on:
    - kjsmdy
    - gxwr7t
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-26T15:29:29Z
---

## What to build

A batch can arrive as a CSV file, so batch generation needs no JSON tooling. The header row names the Variables and, optionally, the Row names; every cell arrives as a string and is typed on the server; the output format and the idempotency key travel as query parameters, because a CSV body has nowhere to carry them. Everything after that is the JSON channel's behavior exactly — the same atomic rejection, the same errors carrying a row index and a Variable name, the same Job.

## Acceptance criteria

- [ ] Posting CSV against a Template creates the same Job the equivalent JSON submission would, with one Row per data row.
- [ ] The header row names Variables, and an optional name column supplies the Row names under the same charset, length, and uniqueness rules as the JSON channel. A header column naming no declared Variable is a submission error naming it.
- [ ] The output format and the optional idempotency key are read from query parameters: png with its scale, jpeg with its optional quality, or pdf. A missing or self-contradictory format is refused before any cell is read.
- [ ] Cells are typed on the server, through the worker's validation call — never by the api and never by a browser. Worked example: a price column whose cell reads `4.99`, against a number Variable, reaches validation as the number 4.99.
- [ ] An invalid cell refuses the whole file, naming the row index and the Variable. Worked example: a boolean column whose cell reads `True` → 422 naming that row and that Variable, and no Job.
- [ ] An empty cell means the Variable was omitted, so its default applies and its absence without a default is an error naming it.
- [ ] Row indexes in errors count data rows from zero, so the header row does not shift them. Worked example: the first data row is index 0.
- [ ] A file with a header and no data rows is refused rather than creating an empty Job.

## Notes

**claude** — 2026-08-19T01:51:22Z

Build note from gxwr7t (the worker's /validate, now built): the typed Rows come back in the response — { errors, templateErrors, rows? }, where rows holds the typed values for a cells:true request. Store those, not the string cells, so a CSV submission stores what the equivalent JSON submission would. templateErrors is the second list: Template problems in the document authority's shape, kept apart from Row errors. Also note that core's validate ignores value keys naming no declared Variable, so this issue's header check ('a header column naming no declared Variable is a submission error naming it') is the api's own, against the Template's declarations.

**agent** — 2026-08-26T14:03:07Z

Seam: the spec's public API (FastAPI test client). The worker's /validate is stood in (RecordingWorker); cells:true and the string cells are observed on that call, and the typed Rows it returns are what get stored. Leftover rows after a refusal, and stored values after a CSV submission, are read from the tables — neither is on the public JobView. Format query-parameter refusal is asserted before the worker is called.

**agent** — 2026-08-26T15:29:27Z

Built CSV batch submission on POST /api/v1/templates/{templateId}/jobs. A text/csv body is the same channel as JSON: the api parses string cells, the worker types them (cells:true), and a clean file stores the typed Rows the worker returned. Format and idempotencyKey travel as query parameters. OpenAPI and the generated client are regenerated.

Decisions a reviewer should know:
- Format refusal is HTTPException 422 (framework shape, no errors key) and happens before CSV parse and before the worker. png takes a scale, jpeg an optional quality (default 90), pdf neither; a missing format or a self-contradictory combination (png+quality, jpeg+scale, pdf+scale/quality, png without scale) is that 422.
- Unknown header columns are this module's check against the Template's declared Variable names. core's validate ignores unknown keys, so the api has to name them; only names are read, types stay the worker's (ADR-0003). _name is the one extra permitted column.
- Empty cells are omitted, so they never reach /validate as empty strings. An explicit empty string stays JSON-only. Row indexes count data rows from zero.
- A header with no data rows is a BatchRefusal, not FastAPI's empty-rows 422. Name charset, length, uniqueness, idempotency, and atomic refusal are the JSON channel unchanged.
- Stored values are judged.rows when cells:true returned them, so a price cell "4.99" is stored as the number 4.99. RecordingWorker echoes the string cells as rows when a test did not set typed ones, matching the real worker's cells:true shape.
- OpenAPI adds optional format/scale/quality/idempotencyKey query params and a text/csv request body. The JSON body schema is SubmitJob | string because FastAPI binds the union that lets the handler read either; the generated client still defaults Content-Type to application/json, so a CSV caller overrides the header.

Tests: apps/api/tests/test_jobs_csv.py, public HTTP seam, RecordingWorker. Leftover rows after a refusal, and stored values after a CSV submission, are read from the tables.

Checks: api ruff/ty green. 160 api tests (uv run pytest tests against the sandbox unix socket / Garage) green, including the 8 new CSV tests and the existing JSON job tests. vp test: 353 TS tests green; the one failed web suite is the pre-existing missing @tanstack/react-virtual in this sandbox, unrelated. pnpm build regenerated openapi.json and the client.
