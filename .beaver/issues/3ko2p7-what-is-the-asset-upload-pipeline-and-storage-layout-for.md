---
id: 3ko2p7
title: What is the asset upload pipeline and storage layout for fonts and images?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
parent: v1xa7j
created: 2026-08-12T02:57:52Z
updated: 2026-08-12T04:50:06Z
---

Interview the user (grill-me skill, limited to this question) to settle the write side of asset storage.

Both published specs fixed the read side and deliberately left the write side open. The core spec (1qoccb): "Assets are content-addressed. A Font Asset (TTF/OTF) and an Image Asset are each one file whose id is the hash of its bytes, served from app storage at an immutable URL. The worker verifies the hash on load." Its Out of Scope: "Upload endpoints and upload UI for fonts and images; this spec defines only the content-addressed read contract." The generation platform spec (0egsmf) excludes the same, and fixes that all file serving proxies through FastAPI — never presigned URLs — so uploads have a shape to match.

The font contract (node oxcf2v) already constrains what may be accepted: TTF and OTF only, with a convert-first message for WOFF2 (opentype.js cannot parse it); variable fonts rejected at upload via `fvar`-table detection, because opentype.js metrics off the default instance are unreliable; nine bundled families vendored in the repo, never a CDN. Those rules need an enforcement point, and this node decides where it lives.

Settle: which endpoints accept an upload and what they return; where hashing and validation happen (FastAPI, or a crossing to the worker, given that font parsing is TypeScript-only under ADR-0003); the MinIO key layout for Font Assets, Image Assets, and their derived metadata, alongside the `jobs/{jobId}/` prefix the generation spec already claims; what metadata is stored per asset (family name and weight for the font picker, intrinsic dimensions for images) and in which Postgres tables under ADR-0005; the size and format limits and what a rejection says; what a re-upload of identical bytes does; whether an asset is ever deleted, given that a stored Design Document may reference it forever; and the upload UI's shape in the editor for both fonts and images.

Input: the core spec 1qoccb, the generation platform spec 0egsmf, node oxcf2v (font contract), ADR-0004 and ADR-0005.

## Notes

**claude** — 2026-08-12T04:30:50Z

ASSET UPLOAD PIPELINE AND STORAGE LAYOUT (grill session, user decided 2026-08-12):

1. INSPECTION LOCATION — fonts inspect on the WORKER via a new internal endpoint `POST /internal/fonts/inspect` (bearer INTERNAL_API_TOKEN, body `application/octet-stream`), using opentype.js — the same parser that later measures every line break. A font that fontTools accepts but opentype.js cannot parse would be an asset that hard-errors at render time; gatekeeping with the render-path parser makes that impossible by construction. It returns the `fvar` verdict (variable font => reject), family, subfamily, weight, italic, postScript name. Images inspect in FASTAPI with Pillow — no parity risk, no crossing.

2. EXIF NORMALIZATION — images are normalized on upload: EXIF orientation applied (re-encoded upright), metadata stripped (GPS/camera data never gets proxied out). Stored bytes are the normalized bytes, and the id is the hash OF THE STORED BYTES — otherwise the worker's hash verification fails on every image. Reason: Pillow reports an orientation-6 phone JPEG as 4000x3000 while Chromium paints it 3000x4000; storing raw numbers would author every such image sideways in a wrongly-shaped frame. The original uploaded bytes are not preserved.

3. BUNDLED FONTS — FastAPI seeds the nine vendored families into MinIO and Postgres on startup, idempotently, next to the existing bucket-ensure step: hash each vendored file, upsert. Bundled and uploaded fonts then take exactly one code path in editor, compiler, and worker; the only difference is a `bundled` flag for picker grouping and delete refusal. Serving bundled fonts from a repo path was rejected — it would create a second asset-resolution path in the code the parity argument rests on.

4. ENDPOINTS — `POST /api/v1/fonts` and `POST /api/v1/images`, both multipart/form-data, both returning the asset record (id, family/weight or width/height, byte size, content type). Serving: `GET /api/v1/fonts/{id}.{ttf|otf}` and `GET /api/v1/images/{id}.{png|jpg|webp}`, proxied from MinIO; the suffix is cosmetic (helps browser and PDF tooling) and is ignored on lookup. Deletion: `DELETE /api/v1/fonts/{id}` and `DELETE /api/v1/images/{id}` => 204.

5. UPLOAD SEQUENCE — fonts: read bytes -> hash -> look up `font_assets` and short-circuit 200 if present (a re-upload never pays for inspection) -> worker inspect -> on clean result put the object, then insert the row -> 201. A rejected font never touches storage: no quarantine prefix, no sweeper. Images: normalize FIRST, then hash the normalized bytes, then dedupe-check, then store and insert. Re-uploading the same photo twice therefore costs one decode; accepted over maintaining two hashes and two lookup paths.

6. ACCEPTED FORMATS AND LIMITS — fonts TTF and OTF only, max 10 MB (WOFF2 and variable fonts already rejected per node oxcf2v). Images PNG, JPEG, WebP; max 25 MB AND max 50 megapixels (25 MB of PNG can decompress into gigabytes inside a worker page). Rejected: GIF (animation is out of scope project-wide; a silently-dropped-frames rule is a surprise), AVIF (encoder/decoder churn against a pinned Chromium), and SVG as an Image Asset (SVG has its own import path flattening to vector elements; admitting it as an image would smuggle an unpinned second text-rendering surface into renders). The declared multipart content type is never trusted — the format is whatever inspection proves; a .png that parses as JPEG is stored as JPEG with the correct key suffix.

7. REJECTION SHAPE — 422 `{ error: { code, message } }` with machine-readable codes so the editor renders a specific message instead of string-matching: `unsupported_format` (WOFF2 gets this, with the convert-first text), `variable_font` (with the export-static-instances text), `unparseable_font`, `file_too_large`, `image_too_many_pixels`, `unsupported_image_format`, `asset_is_bundled` (409 on delete). Deliberately NOT the NamedVariableError shape — no Variable is involved, and reusing it would imply one.

8. HASH AND KEY LAYOUT — SHA-256, full lowercase hex (64 chars), no truncation: the ids live in stored Design Documents forever. TWO buckets: `media-canvas-assets` (fonts and images, write-once) and `media-canvas-outputs` (the existing `jobs/{jobId}/` prefix, deletable per job). The bucket boundary makes it structurally impossible for job deletion's prefix-wipe to reach an asset. Keys are flat: `fonts/{id}.{ttf|otf}`, `images/{id}.{png|jpg|webp}` — MinIO's namespace is flat, so hash-shard directories would be cargo cult from filesystem-backed stores.

9. POSTGRES TABLES (api-owned, Alembic, ADR-0005) — two tables, not one polymorphic `assets` table; the metadata has almost nothing in common and a shared table would be half nullable columns.
   font_assets:  id TEXT PK (sha256 hex), storage_key TEXT, format ('ttf'|'otf'), family TEXT, subfamily TEXT, weight INT, italic BOOL, postscript_name TEXT, byte_size BIGINT, bundled BOOL, original_filename TEXT, created_at
   image_assets: id TEXT PK (sha256 hex), storage_key TEXT, content_type TEXT, width INT, height INT, byte_size BIGINT, original_filename TEXT, created_at
   family/subfamily/weight/italic exist purely so the picker can group faces; nothing in the render path reads them. width/height are the post-normalization numbers, the only ones that exist.

10. DUPLICATE BYTES — a re-upload returns 200 with the existing asset record; not 409, not a duplicate row. Content addressing makes it a no-op by construction and the UI never has to explain a duplicate error. Two different font files declaring the same family name are simply two Font Assets. Concurrent identical uploads resolve as ON CONFLICT DO NOTHING followed by returning the existing record.

11. DELETION — assets ARE deletable (user's ruling, overriding the recommendation of no delete endpoint). Nothing tracks which Design Documents reference an asset, ahead of time or at delete time: FastAPI treats Design Documents as opaque JSON (ADR-0003) and could not answer that question without a crossing to the worker or a reference index that must stay correct forever. A delete removes the Postgres row and then the MinIO object in that order (object-first would leave a row pointing at nothing; row-first leaves a harmless sweepable orphan). HARD delete, no `deleted_at` tombstone — a tombstone would collide with a later re-upload of the same bytes under the same primary key. Designs and templates referencing a deleted asset hard-error by the existing missing-asset rule. Re-uploading identical bytes recreates the asset at the same id and revives every reference.
   Refusals: bundled fonts only (409 `asset_is_bundled`). A delete is NOT blocked by in-flight Generation Jobs — they render from a template snapshot and their Rows fail with the named missing-asset error, which is the same behavior stored designs get. Blocking would require the reference tracking that was ruled out.

12. DELETE CONFIRMATION — a confirm dialog stating plainly that any design or template using the asset will fail to render until replaced, with no scan behind it. One exception: the editor already holds the open document in memory, so it checks THAT document for free and says \"used by 3 elements in this design\" instead of the generic warning. Zero queries, zero storage — not the reference index that was rejected.

13. MISSING ASSET IN THE EDITOR — the compiler cannot produce partial output (without font bytes it cannot measure a line), so there is no version where the rest of the canvas renders and one element shows a broken-image icon. A missing asset REPLACES the preview surface with a blocking error panel naming the missing asset id and listing the offending elements by name, with a per-asset REPLACE action: pick another Font Asset or Image Asset and the panel rewrites those references in the document, restoring the preview. Without that action a user is stuck with an undeletable, unopenable design. The panel's visual design belongs to the editor spec (node 9eooei); what is settled here is that a missing asset blocks the whole preview and that replacement is reachable from the error itself.

14. NO DERIVED FILES — no thumbnails, no derivative keys, no derived-metadata objects in v1. The Assets panel points <img> at the same immutable URL and lets the browser downscale. Wrong at 25 MB x 50 images, but adding it later is an afternoon, whereas adding it now means a second key layout, a second inspection output, and a \"which files exist for this asset\" question inside every deletion and migration discussion. Frontier if the panel drags.

15. EDITOR UI — two surfaces.
   Images: drag-and-drop onto the canvas plus a paste handler. A drop uploads immediately (not on save) and on success creates an ImageElement at the drop point, sized to fit the canvas, with naturalWidth/naturalHeight from the response. Upload progress and any 422 render on the placeholder, which vanishes on rejection.
   Fonts: an \"Upload font\" entry inside the font picker itself, not a separate screen. The picker groups by family with faces beneath; bundled families first under a divider. On success the new face is selected immediately for the current text element. Rejections render inline in the picker, so the convert-first and export-static-instances messages appear where the user was trying to use the font.
   Assets panel: two sections, Images and Fonts (user's ruling), each with its own upload control — the panel is a complete management surface and the picker's inline upload is a convenience shortcut. Images as a thumbnail grid, fonts as rows rendering their own family name in their own face. Each entry has a delete action leading to item 12's dialog. Bundled fonts DO appear in the Fonts section, grouped and marked, with no delete action — hiding them would make the panel disagree with the picker about what fonts exist. Dragging from the panel onto the canvas creates an element without an upload.

16. SERVING HEADERS — asset GETs send `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=31536000, immutable` (safe: the id IS the hash). CORS is load-bearing, not incidental: @font-face is CORS-restricted even for a plain GET, and in dev `web` runs on :3000 while `api` runs on :8000, so without the header every font fetch fails silently, the editor falls back to no font, and every measurement is wrong — which looks exactly like a compiler bug. Assets are unauthenticated public bytes in v1; when auth arrives it lands on this proxy, which the Frontier already names as the enforcement point. Content types: font/ttf, font/otf, image/png, image/jpeg, image/webp. The worker's Chromium hits the same URLs with the same headers, so editor and worker fetch identically.

Feeds the editor spec (node 9eooei). Items 1, 4, 5, 6, 7, 8, 9, 11, 16 also bind the api and worker services the generation platform spec (0egsmf) describes.

**claude** — 2026-08-12T04:50:06Z

Item 11 (deletion without reference tracking) is recorded as ADR-0007 — docs/adr/0007-unindexed-asset-deletion.md. It is hard to reverse and an implementer will be tempted to add reference counting; the ADR closes that debate.
