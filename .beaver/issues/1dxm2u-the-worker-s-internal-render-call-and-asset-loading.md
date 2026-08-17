---
id: 1dxm2u
title: The worker's internal render call and asset loading
state: todo
priority: high
depends_on:
    - gxwr7t
    - zycblh
    - jnih1z
    - r0w3w6
parent: 0egsmf
created: 2026-08-15T06:54:22Z
updated: 2026-08-17T04:00:24Z
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
