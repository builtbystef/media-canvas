---
id: 39y4fh
title: 'The Batch tab: CSV pick, the mapping preview, and submission'
state: todo
priority: high
depends_on:
    - p45jd2
    - uemwae
    - 4t1ze9
parent: wz3ev2
created: 2026-08-15T07:29:16Z
updated: 2026-08-15T07:29:16Z
---

## What to build

A batch starts where the design already is. The Generate dialog grows a second tab for templates only, and that tab takes a CSV file: picking one parses it in the browser into a read-only preview, with a summary matching its header row against the Template's declared Variables so shape mistakes are visible before anything is sent. The summary warns and never blocks — cell types are the server's business, and its refusal is the only real gate. Submitting sends the file's own bytes, and lands on the job's page, where the batch is already moving.

## Acceptance criteria

- [ ] The dialog shows the batch tab only when the open document is a template; a design's dialog is exactly what it was. The one-off tab is the selected tab on every open, and the dialog remembers no tab, file, or format from a previous open.
- [ ] The batch tab uses the dialog's existing output-format picker — PNG at one, two or three times, JPEG with a quality, or PDF — and exactly one format goes with a submission.
- [ ] Picking a CSV parses it in the browser and shows the rows in a read-only, virtualized table. Nothing in the preview is editable.
- [ ] A summary maps each header against the Template's Variables under five outcomes: matched, missing but defaulted, missing and required, an unknown column, and the Row-name column recognized. Worked example: headers `title,price,_name` against Variables `title` (text, required), `price` (number, default 0) and `accent` (color, with a default) → `title` and `price` matched, `accent` missing but defaulted, the name column recognized, no unknowns. Adding a `notes` header → `notes` unknown. Removing the `title` header → `title` missing and required.
- [ ] The summary checks shape only, never a cell's type, and never disables submission. Worked example: a summary reporting one missing-required Variable and one unknown column still leaves submission available.
- [ ] Submitting sends the file's own bytes as a CSV body, with the output format and the idempotency key as query parameters. The client never assembles rows as JSON and never types a cell.
- [ ] A submission that is accepted closes the dialog and opens the new job's page; a submission answered with an already-existing job opens that job's page just the same.
- [ ] An idempotency key is minted when a file is parsed and travels with every submission of that parse; retrying after a failed attempt reuses it, and re-parsing or picking another file mints a new one. Worked example: parse → key K; a submission fails on the network; submitting again sends K; picking the file again yields a different key. The key appears nowhere in the interface.
- [ ] A Viewer never reaches the tab, because the editor is read-only for them.
- [ ] The mapping summary and the key's lifecycle are tested as pure logic, without a browser.
- [ ] The CSV parser named in the spec is the only dependency this slice adds.
