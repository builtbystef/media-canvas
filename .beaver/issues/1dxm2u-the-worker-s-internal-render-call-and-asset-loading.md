---
id: 1dxm2u
title: The worker's internal render call and asset loading
state: done
assignee: agent
priority: high
depends_on:
    - gxwr7t
    - zycblh
    - jnih1z
    - r0w3w6
parent: 0egsmf
created: 2026-08-15T06:54:22Z
updated: 2026-08-25T17:24:25Z
---

## What to build

The worker turns a Template plus one row of values into file bytes, synchronously and on demand. It resolves the values, loads every asset the document references, compiles, and renders in a pooled browser page. A row whose values are wrong is refused before a browser is touched. The render page reaches the network for nothing at all: by the time it loads, every font and every image is already inside the markup.

## Acceptance criteria

- [ ] The internal render call takes a Template, one set of values, and an output format, and returns the file bytes — or refuses with named-Variable errors, having opened no page. Worked example: values naming a Variable the Template does not declare → a refusal naming it, and no browser work.
- [ ] The call carries the Workspace, because an asset's identity is its Workspace together with its hash; the worker fetches asset bytes from `GET /internal/workspaces/{workspaceId}/assets/{assetId}` with the shared internal credential — 200 raw bytes with the asset's content type, 404 unknown, as the contract written on jr6mye (asset pipeline spec) states. That endpoint is built elsewhere — build against that exact shape here, and stand it in for tests.
- [ ] Images are fetched by the worker, never by the render page: every image the document references, app-held or an external address, is embedded in the markup before the page loads. Worked example: a document referencing one held image and one external address renders with the page issuing no requests of its own.
- [ ] An asset that cannot be fetched fails the render with an error naming the asset, and that failure is distinguishable from one caused by bad values, because the two are retried differently later.
- [ ] Browser pages are pooled at a fixed concurrency of eight, and that one pool serves every render this worker performs. Pages are reused across renders, and a page that dies takes neither the service nor the other renders down.
- [ ] The same request twice returns the same bytes, and nothing about the render is persisted anywhere.
- [ ] Contract tests drive the call over HTTP against the real core with the asset source stood in, covering the bytes case, the refusal case, and a failing asset fetch.

## Notes

**claude** — 2026-08-17T04:00:24Z

The asset-bytes contract this call consumes is now written on jr6mye: GET /internal/workspaces/{workspaceId}/assets/{assetId}. Stand that exact shape in for tests; do not invent a different one.

**agent** — 2026-08-25T17:24:25Z

Seam: the worker's internal HTTP service (spec 0egsmf seam 2). Contract tests in apps/worker/src/internal-render.test.ts drive POST /render over real HTTP against the real core. The asset source is stood in as GET /internal/workspaces/{workspaceId}/assets/{assetId}. The page pool is stood in for the HTTP tests (CI's unit job has no Chromium); reuse, death isolation, and concurrency are tested against a real browser in page-pool.test.ts (skipped when CI=true). In-image render checks (zycblh) remain the pinned screenshot proof.

Built
- POST /render { workspaceId, template, values, output } → 200 file bytes | 422 { errors } | 502 { error: { assetId, message } }.
- Pipeline: validate (including undeclared names) → resolve → fetch every referenced font/image → compile with data URIs → page-pool render. Value problems never open a page; a 404/timeout on an asset never opens a page.
- Page pool of 8, lazy browser, pages reused, a closed page is discarded and the next render opens another. Pooled pages abort any non-data/about request.
- Worker fetches held assets from the api at API_INTERNAL_URL (default http://localhost:8000; compose sets http://api:8000). External http(s) image URLs are fetched by the worker, not the page.

Decisions
- 422 vs 502 is how a later retry tells value failures from fetch failures (dblx26). Same error classes (ValueRefusal, AssetFetchError) are what the queue consumer will catch in-process.
- Undeclared values are refused only on /render, not on /validate — extra CSV columns are dropped before validate, and this issue's worked example is the render call.
- render(svg, options) stays one-browser-per-call for goldens (zycblh). The pool is the production path.
- No new dependencies. fetch is Node's.

Facts for a reviewer: pnpm check passes. Worker vitest 62 passed. API pytest 121 passed against the compose Postgres via the sandbox unix socket. Compose worker now depends_on api (service_started) so a deployment brings the origin it reads assets from.
