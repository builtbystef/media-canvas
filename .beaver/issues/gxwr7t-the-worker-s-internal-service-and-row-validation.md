---
id: gxwr7t
title: The worker's internal service and Row validation
state: done
assignee: claude
priority: high
depends_on:
    - d2v61j
parent: 0egsmf
created: 2026-08-15T06:54:15Z
updated: 2026-08-19T01:51:22Z
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
- [ ] The validate payload carries the Workspace id alongside the Template and the Rows, per the 0egsmf seam decision of 2026-08-15 — an asset's identity is its Workspace together with its hash, and the render call (1dxm2u) carries the same field for the same reason. Validation itself resolves no assets today; the field is part of the payload shape so the two internal calls stay one shape.
- [ ] Contract tests drive the service over HTTP against the real core, covering the clean batch, a Row-level error, and both cell-typing outcomes.

## Notes

**claude** — 2026-08-17T04:00:24Z

Amended 2026-08-16: the validate payload carries the Workspace id, aligning with the 0egsmf seam decision of 2026-08-15 so both internal worker calls share one payload shape.

**claude** — 2026-08-19T01:51:12Z

Built the worker's internal HTTP service and its `/validate` call: `apps/worker/src/internal-service.ts`, with contract tests in `apps/worker/src/internal-service.test.ts` (seam 2 of the spec's Testing Decisions — every test drives real HTTP against the real core, no fakes), plus `typeCells` in the shared core (`packages/core/src/values.ts`), and the service started from `apps/worker/src/index.ts`.

Completed work
- The service is `node:http` — the spec left the server an implementer's choice within Fastify or the built-in, and the standard library covers one route with no new dependency. Configuration is read once at startup by `internalServiceConfig(process.env)`, which fails naming the variable at fault, as the api's settings module does: `INTERNAL_API_TOKEN` is required, `WORKER_INTERNAL_PORT` defaults to 4000. Both are now in `.env.example`. Every request presents the bearer credential or gets 401; the comparison is `timingSafeEqual`.
- `POST /validate` takes `{ workspaceId, template, rows, cells? }`. The Template is validated once by `validateDocument`, and rows are judged only against a document that is one. Each Row's errors carry the Variable, a message, and the row index, counting from zero.
- Cell typing lives in core beside `validate`, and the service's `/validate` handler is its only caller. A number cell follows the JSON number grammar (no leading plus, no bare `.5`, no trailing text), a boolean cell is the case-sensitive literal `true`/`false`, and an empty cell — or an absent column — means omitted for every Variable type, text included, so the default applies and a Variable without one is an error naming it. An explicit `""` stays reachable only through the JSON channel.
- A cell that cannot be typed suppresses the omission error validation would then raise for the same Variable: one problem, one error.
- `workspaceId` is required and a payload without one is a 400, so the api is held to the shape the render call (1dxm2u) also carries.

Decisions a reviewer needs
- THE RESPONSE CARRIES TWO FIELDS THE SPEC'S ONE-LINE CONTRACT DID NOT NAME. It is `{ errors: RowError[], templateErrors: ValidationError[], rows? }`. (1) `templateErrors` exists because this issue requires Template problems to be reported as the document authority reports them: a `ValidationError` carries `elementId`/`assetId` and no row index, so it does not fit `RowError`, and folding it in would be exactly the "broken Template mistaken for bad Rows" the criterion forbids. Both lists are always present; a clean batch is two empty lists. (2) `rows` returns the typed Rows for a `cells: true` request, because 4t1ze9 requires a CSV submission to create the same Job the equivalent JSON submission would, while typing may live only behind this call — without the typed Rows coming back, the api would have to store string cells and every CSV Job would fail at render. Both are additive; no existing field changed meaning. Recorded as an amendment note on the spec (0egsmf) and on 4t1ze9.
- Batch orchestration (per-Row loop, row indexes, the cell-error/omission rule) sits in the worker, not core: core keeps one Row's authority, `validate` and `typeCells`. The cost is one `validateDocument` pass per Row inside `validate`; measured against correctness, keeping the one authority won. Worth revisiting only if a large batch shows it.
- The handler answers 500 rather than letting an unexpected throw reject unhandled — an unhandled rejection ends the worker process and every render queued behind it.
- `apps/worker/environment.json` changed: its `compiler` hash covers core's non-test sources, so adding `typeCells` moved it. Regenerated with `pnpm --filter worker run environment:write`. No golden baselines exist yet (6bqdxe), so nothing was re-baked.
- The worker's dev script now loads the root `.env` (`node --env-file-if-exists=../../.env`), so `pnpm dev` starts it the way the api reads the same file. An existing `.env` needs `INTERNAL_API_TOKEN` added.
- Not built here, by scope: `/render` (1dxm2u), font inspection (21plhn), and the queue consumer. Unknown value keys naming no declared Variable are still ignored by core's `validate` — the header check belongs to 4t1ze9.

Checks: `pnpm check`, `pnpm test` (127 TS + 64 Python) and `pnpm build` all pass; no OpenAPI or client drift. The service was also smoked as a real process: 401 without the credential, and a `cells: true` batch typing `"4.99"` to 4.99.
