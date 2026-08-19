---
id: jr6mye
title: Asset serving, listing, deletion, and the worker's internal access
state: done
assignee: claude
priority: high
depends_on:
    - 21plhn
    - t60pvx
parent: ek7pq1
created: 2026-08-15T07:12:12Z
updated: 2026-08-19T11:45:39Z
---

## What to build

Assets come back out, get listed, and go away again. Bytes are served by the api from its own storage at an address that never changes, because the id is the hash; the editor lists what a Workspace holds; and a delete removes the asset outright, with nothing tracking which documents referenced it. That last part is deliberate and already decided: a document referencing a deleted asset fails loudly, and re-uploading the same bytes revives every reference at the same id.

## Acceptance criteria

- [ ] An asset is served with its own content type at an address carrying its Workspace and its id; a suffix on the address is cosmetic and ignored when looking the asset up. Worked example: the same asset fetched with and without the file extension returns the same bytes.
- [ ] Serving is authenticated and cached as immutable and private; no anonymous request receives asset bytes, and no storage URL or credential ever reaches a client.
- [ ] Both list endpoints return that Workspace's records newest first, unpaginated, each with the metadata its kind carries and its serving address; font records report whether they are bundled.
- [ ] Deleting removes the database row first and the stored object second, with no tombstone, so re-uploading the same bytes recreates the asset at the same id and revives every document that referenced it.
- [ ] A bundled font refuses deletion with its own code; every other asset deletes unconditionally, including one that documents or in-flight Generation Jobs reference. Nothing counts references, before or during the delete.
- [ ] The render worker reaches asset bytes at `GET /internal/workspaces/{workspaceId}/assets/{assetId}`, behind the shared internal bearer credential: 200 with the raw bytes and the asset's own content type; 404 for an unknown Workspace or asset, without distinguishing the two; 401 without the credential. Fonts and images share the route — the id is the hash, and kind changes nothing about serving. The worker holds no Membership, and the api stays the only thing that reads asset rows or knows storage keys. The consumer (1dxm2u, generation-platform spec) builds against exactly this shape.
- [ ] Deleting is Editor-level; listing and fetching are open to any member of the Workspace; a caller outside it is refused in a way that does not reveal whether the asset exists.

## Notes

**claude** — 2026-08-17T04:00:24Z

Contract written 2026-08-16: the worker-facing asset-bytes route is GET /internal/workspaces/{workspaceId}/assets/{assetId} - 200 raw bytes with the asset content type; 404 for unknown workspace or asset, undistinguished; 401 without the internal bearer credential. Fonts and images share the route. 1dxm2u builds against exactly this shape.

**claude** — 2026-08-19T11:06:49Z

Built alongside 21plhn (font upload), 2026-08-19: the upload response FontAssetView carries id, format, family, subfamily, weight, italic, postscriptName, byteSize, bundled, originalFilename, createdAt - everything the spec lists except url, because the serving route is yours. Add url to that model when the route lands; it is additive and the view is already shared-shaped. Storage keys are {workspaceId}/fonts/{id}.{ttf|otf} in the assets bucket, and the api reaches them through media_canvas_api.storage; the row carries storage_key so serving never rebuilds the address itself.

**claude** — 2026-08-19T11:15:39Z

Image upload landed with t60pvx, 2026-08-19: ImageAssetView carries id, contentType, width, height, byteSize, originalFilename, createdAt — everything the spec lists except url, for the same reason FontAssetView does, because the serving route is yours. Keys are {workspaceId}/images/{id}.{png|jpg|webp} in the assets bucket, and the row carries storage_key with the content type beside it, so serving never rebuilds either.

**claude** — 2026-08-19T11:45:39Z

Built 2026-08-19. Six routes, all in the api; no editor surface (the Assets panel and the font picker are their own slices).

- GET/DELETE /api/v1/workspaces/{wsId}/{fonts|images}/{assetId} — serving and deletion. The address carries the Workspace because that is half an asset's identity, and the suffix is taken off in one place (assets.without_suffix) inside the item-route gate, so no route below ever sees one. Both views gained `url`, built from the row by assets.serving_path; storage_key stays inside the api.
- GET /api/v1/workspaces/{wsId}/{fonts|images} — the lists, newest first (created_at desc, id), unpaginated, Viewer-level.
- GET /internal/workspaces/{wsId}/assets/{assetId} — the worker's route, in its own module (internal.py), fonts and images together: two primary-key lookups, font table first.

Decisions taken while building.

1. SERVING HEADER: Cache-Control is `private, max-age=31536000, immutable`. The spec amendment writes it as "private, immutable"; `immutable` with no freshness lifetime is inert (every fetch revalidates), which contradicts the criterion's "cached as immutable". Read as: the amendment changed `public` to `private` and did not intend to drop the year. Both readings satisfy "immutable and private".

2. DELETE IS WORKSPACE-SCOPED, not id-based. The amendment says "item routes stay id-based", but asset identity became (workspace_id, hash) in the same amendment, so an id alone is not a key. Serving already carries the Workspace by its own acceptance criterion; delete follows it.

3. `url` IS A RELATIVE PATH (/api/v1/workspaces/{wsId}/fonts/{id}.ttf). The editor reaches the api at its own origin — behind Caddy in a deployment, behind the dev server's rewrite in `next.config.ts` otherwise — so an absolute base would only be a way to get the origin wrong.

4. THE INTERNAL CREDENTIAL IS CHECKED IN AccessMiddleware, not by a route dependency, for the same default-deny reason the session check is there: anything under /internal is unreachable without the shared token, whether or not the route that gets added later remembers to ask. A session is no way in to /internal, and the token is no way in anywhere else. Constant-time comparison, on bytes.

5. THE INTERNAL ROUTER IS include_in_schema=False. It is one half of a conversation between two services, so no generated client should offer it; 1dxm2u builds the worker's side against the shape in the contract note, by hand, as the worker has no api-client dependency.

Facts for a reviewer. AssetRefused gained a `status` (422 by default, 409 for asset_is_bundled) so both refusals keep the one { error: { code, message } } envelope. A bundled font is arranged in the tests by writing the flag directly, because seeding is vn4r07's; the Role gate runs before the bundled check, so a Viewer deleting one gets 403. Deletion is proved row-first-object-second by making the object delete fail and finding the record already gone — the mirror of the existing upload test. openapi.json and packages/api-client are regenerated.
