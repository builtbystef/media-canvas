---
id: 4t1ze9
title: CSV batch submission
state: todo
priority: medium
depends_on:
    - kjsmdy
    - gxwr7t
parent: 0egsmf
created: 2026-08-15T06:54:42Z
updated: 2026-08-15T06:54:42Z
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
