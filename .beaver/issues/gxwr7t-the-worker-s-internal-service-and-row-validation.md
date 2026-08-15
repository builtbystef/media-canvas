---
id: gxwr7t
title: The worker's internal service and Row validation
state: todo
priority: high
depends_on:
    - d2v61j
parent: 0egsmf
created: 2026-08-15T06:54:15Z
updated: 2026-08-15T06:54:15Z
---

## What to build

The api can ask the worker whether a batch is good before anything renders. The worker exposes a small internal service, reachable only with the shared internal credential, whose first job is to take a Template and a list of Rows and answer with one error per problem — each carrying the row index and the Variable at fault. CSV cells arrive as strings, so the same call can be asked to type them first: this is the one place `4.99` becomes the number 4.99, and it lives in the shared core beside validation, never in the api and never in a browser.

## Acceptance criteria

- [ ] The worker runs an HTTP service on a port from the environment and refuses any request without the shared internal bearer credential.
- [ ] Validating a Template with Rows returns an empty error list when every Row is good, or one entry per problem carrying the row index, a message, and the Variable name where the problem is about a Variable. Worked example: three Rows where the second omits a Variable that has no default → exactly one error, row index 1, naming that Variable.
- [ ] Row indexes count Rows from zero, so the first Row is index 0.
- [ ] Problems with the Template itself are reported the same way the document authority reports them, so a broken Template is never mistaken for bad Rows.
- [ ] Asked to type cells first, string cells become typed values before validation: a number cell follows the JSON number grammar, a boolean cell is the literal lowercase `true` or `false`, and an empty cell means the Variable was omitted. Worked examples: cell `4.99` against a number Variable → the number 4.99, clean; cell `True` against a boolean Variable → an error, because the literal is case-sensitive; cell `4.99x` → an error naming the Variable.
- [ ] An empty cell means omitted for every Variable type, text included: the declared default applies, and a Variable with no default is an error naming it. Supplying an explicit empty string is possible only through the JSON channel.
- [ ] Cell typing lives in the shared core beside validation and is exercised only through this call, so no other service can grow a second interpretation of a cell.
- [ ] Contract tests drive the service over HTTP against the real core, covering the clean batch, a Row-level error, and both cell-typing outcomes.
