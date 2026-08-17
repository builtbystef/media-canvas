---
id: v1xa7j
title: Media Canvas — roadmap
state: in-progress
assignee: builtbystef
labels:
    - roadmap
created: 2026-08-08T07:08:13Z
updated: 2026-08-15T04:38:41Z
---

## Goal

A running web app where the user designs a static visual asset (Instagram post, poster, ad, website graphic) in a visual editor; the design is saved in a structured, versioned format; any design can be promoted to a template with variable slots (text, images, colors, prices); and assets are produced from templates one-off in the UI or by the hundreds/thousands via API, CLI, or batch data upload — with background workers doing the rendering, and exported output matching what the editor showed.

Stack constraints given by the user: Next.js frontend, FastAPI backend. Audience: the user themselves first, self-hosted — and built as a multi-tenant "SaaS minus billing" from v1 (node ejy8hn, ADR-0009): Workspaces, Users, and RBAC are in the architecture now, so productizing later adds billing, not structure.

## Frontier

- CLI: what it wraps, its language, how it is distributed. (Post-MVP per node ylg1wr — a thin client of the generation API, whose contract node jgo8tv settled.)
- Thumbnails or derived image files for the Assets panel — v1 has none, and the panel points `<img>` at the full-size immutable URL (node 3ko2p7). Revisit when a library of large images makes the panel drag; it costs a second key layout and a "which files exist for this asset" question in every deletion and migration discussion, which is why it waited.
- Sweeping storage objects orphaned by a failed delete — asset deletion (node 3ko2p7) and Workspace deletion (spec 88v6vg) both remove Postgres rows before the stored objects, so a crash between the two leaves unreferenced objects. Harmless and sweepable; no sweeper is built.
- Print-ready PDF export (CMYK, bleed/trim marks) and color management. (Digital RGB PDF, JPEG, and PNG are in the MVP per node ylg1wr; the engine verdict gqr8bf makes digital PDF a vector printToPDF output.)
- Document version history — list, preview, and restore of earlier saves. v1 keeps one current JSON per document (node 73rm0x): undo covers in-session mistakes, promotion copies protect Templates, Job snapshots protect batches. Autosave makes history the natural next safety layer once real work accumulates.
- Design document migration mechanics as the format version advances. (Strategy settled by node 53lwlc — required integer schemaVersion, forward-only migrations applied at load, renderer accepts only the current version; the mechanics land with the first version bump.)
- Auto-layout / resize anchoring — v1 is absolute positioning only (node 53lwlc); template reuse across canvas sizes may want it in a later version.
- Auto-fit text: shrink font until content fits a fixed box, for batch generation (node 53lwlc) — v1 wraps at fixed width with auto height from a vertical anchor instead (canvas-edge overflow accepted, node k77nv9).
- Focal point / smart crop for image Fit Mode — v1 `cover` centers the image (node k77nv9).
- Richer Variable constraints beyond v1's text maxLength/minLength — number ranges, regex patterns (node k77nv9).
- Bindable property kinds beyond v1's text content / image source / solid color / number / visibility: geometry, fonts, opacity (node 53lwlc).
- Formatting of price/number variables, localization. (v1 interpolates a number as ECMAScript String(number), node 6lxoec.)
- What productizing still changes about deployment: registry-published images / a packaged installer, hosted multi-tenant operations, billing infrastructure. (Accounts and tenancy themselves are v1 now — node ejy8hn, ADR-0009. The v1 self-hosted deployment settled — node ex95f4: a portable compose stack, one root docker-compose.yml with an `app` profile adding api, web, the pinned worker image, and a single-origin Caddy entry with a DOMAIN-flag TLS flip; images build from source, the repo is the distribution. The spec lands via node n60ho8.) One cost to weigh when hosting is real: the no-presigned-URL rule (kjz6f0, 0egsmf) puts every generated asset through the app servers twice, which is right for v1 — stable immutable URLs, hidden topology, one enforcement point — but is a 0egsmf decision to reopen at hosted scale, not a v1 one (node jl1ew8).
- OAuth / SSO sign-in — v1 is email OTP only (node ejy8hn); a hosted product likely wants Google/GitHub login, which changes nothing structural.
- Scoped or per-role API keys — v1 keys are workspace-owned and Editor-equivalent on the generation surface only (node ejy8hn); finer scopes, expiry, and per-key rate limits are accounts-era.
- Session management UI — listing and revoking one's own sessions across devices; v1 has only POST /logout for the current session (node ejy8hn).
- Editor performance beyond the preview: how many elements the layer list, overlay, and hit-testing hold up under, and whether very large documents need virtualization. (Node vnmueh measured the preview only — a full compile of a 236-element document costs ~27 ms, paid at load, font change, and canvas resize; nothing measured the rest of the editor's frame. Node ep90f3 now names what the overlay must do per frame: selection handles, rotation zones, marquee, and snap guides computed against every other element's bounding box, which is the first thing here that scales with document size.)
- Worker fleet scaling, retry semantics, observability. (Measured baseline from node gqr8bf: ~166 ms/render at 8 concurrent pages in one browser instance, ≈2.8 min per 1,000 assets on one host. Contract-level retry settled by node jgo8tv: one automatic retry per Row on transient errors; fleet policy stays open.)
- Webhooks for Generation Job completion — v1 signals completion by polling only (node jgo8tv); webhooks need callback registration, signing, and delivery retries.
- Output retention policy once productized — v1 keeps Generation Job outputs until an explicit delete-job call, no auto-expiry (node jgo8tv).
- Template organization: galleries, search, duplication.
- Emoji and extended glyph coverage: v1 renders a missing glyph as the Font Asset's own .notdef, identically in editor and worker (node oxcf2v); a bundled fallback chain (Noto Sans / Noto Color Emoji) would need per-character font fallback inside the compiler's line-breaking math.
- Variable font support — rejected at upload in v1 (node oxcf2v); revisit if a needed brand font ships variable-only.

## Out of scope

- Animated or video assets — the product is static visuals only.
- Billing, plans, quotas, and usage metering (node ejy8hn, ADR-0009) — v1 is multi-tenant "SaaS minus billing." This line originally excluded all multi-tenant SaaS features; the user reversed the tenancy half on 2026-08-15 (Workspaces, Users, RBAC are v1), and money remains the productizing boundary.
- Password authentication (node ejy8hn) — email OTP via Resend is the only sign-in; no password storage, no reset flows.
- An instance admin, root account, or seed step (node ejy8hn) — fully self-serve: signup is sign-in, any User creates Workspaces, Owners invite. No instance-level concepts exist.
- An in-app signup allowlist or access guard (node ejy8hn) — registration is open; restricting a private remote instance is the deployer's network-layer job (proxy rules, IP allowlists, VPN), outside the app.
- Changing a User's email address, and deleting a User account (node n60ho8) — neither was in the settled record; excluded from v1 during the deployment-and-access spec rather than invented.
- Pen tool / Bézier path editing in the MVP — SVG import substitutes (node ylg1wr).
- Element-masks-element masking in the MVP — image crop-within-frame and clip-to-shape only (node ylg1wr).
- Inner shadows, background blur, and blend modes in the MVP — editor-vs-renderer fidelity traps (node ylg1wr).
- Gradients on text or borders in the MVP — fills on shapes and canvas background only (node ylg1wr).
- Multi-page documents (node ylg1wr).
- Rich text spans — mixed styles inside one text box (node ylg1wr).
- SVG export in the MVP (node ylg1wr).
- Pixel parity between two *different* rendering engines as a design goal (node 7mza2q) — no surveyed engine claims it and the canvas spec does not require it. Editor and worker run the same engine over the same pinned inputs, or the goal is abandoned.
- satori as the renderer (node 7mza2q) — states outright it does not guarantee matching browser output; no kerning, ligatures, OpenType features, or RTL; flexbox-only layout does not model an absolutely-positioned design canvas.
- node-canvas / Konva / fabric.js server-side as the renderer (node 7mza2q) — same API over a different rasterizer than the browser, which is the parity trap itself; publishes a wiki of known divergences.
- librsvg as the renderer (node 7mza2q) — textPath unsupported, no @font-face, text shaping documented as not done across spans, emoji broken; LGPL-2.1.
- CanvasKit as the sole engine (node 7mza2q) — its Canvas2D layer does no shaping, kerning, or font fallback; built with PDF disabled; no Python binding. (Skia via skia-python or @napi-rs/canvas stays available should the PDF path need it.)
- resvg as the rendering engine (node gqr8bf) — the prototype proved its byte-identical native-vs-WASM parity claim exactly, but Chromium was chosen: vector PDF comes free from the same engine, the editor DOM is (nearly) the render markup, and measured throughput (≈2.8 min per 1,000) suffices. With it goes the resvg-WASM editor-preview architecture. Byte-exact parity is traded for visual parity inside one pinned Chromium environment.
- Byte-equality as the render regression bar (node gqr8bf) — measured: Chromium differs from itself by 0.53% of pixels across headless flavors (antialiasing only). The bar is a perceptual tolerance, settled by node ud46e4.
- Literal SVG as the stored design document format (node 53lwlc) — semantic concepts (groups, crop frames, Variables, template metadata) would live in data-* attributes; the stored format is a project-owned JSON schema compiled to render markup.
- Semver for the design document schema version (node 53lwlc) — one writer, no ecosystem to signal compatibility ranges to; a single integer suffices.
- Placeholder/fallback content in generated output (node k77nv9) — a row with a missing required value or a failed image fetch fails with a named-variable error before or during render; batches never silently ship neutral placeholders.
- A global per-template on-error setting (node k77nv9) — rules live per element (Fit Mode) and per Variable (constraints); one template has one deterministic behavior.
- WOFF2 font uploads in the MVP (node oxcf2v) — the compiler measures text with opentype.js, which cannot parse WOFF2; TTF and OTF only, with a convert-first message.
- Variable fonts in the MVP (node oxcf2v) — opentype.js metrics off the default instance are unreliable: exactly the editor-vs-worker line-break drift the font contract exists to prevent. Rejected at upload via fvar-table detection.
- External font CDNs at render time (node oxcf2v) — fonts are content-addressed Font Assets served from the app's own storage; bundled fonts are vendored in the repo. No Google Fonts links, ever.
- Glyph fallback chains in the MVP (node oxcf2v) — a missing glyph renders the Font Asset's own .notdef, identically in editor and worker; fallback faces are never substituted silently.
- chrome-headless-shell as the worker's headless flavor (node 6lxoec) — full Chromium new headless is pinned; the shell build measurably diverges (0.53% of pixels) from the desktop Chrome the editor runs in.
- A Python re-implementation of the compiler or validation (node 6lxoec) — one shared TypeScript core package is the single implementation (ADR-0003); render workers are Node, written in TypeScript.
- An escape syntax for a literal {{ in text content (node 6lxoec) — no v1 design needs it; revisit only if one does.
- Inside/outside stroke alignment in the MVP (node 6lxoec) — v1 borders are SVG-native strokes centered on the edge.
- Multi-fill vector elements (node 6lxoec) — a vector element is one path with one fill; SVG import flattens a file into a group of single-path vector elements.
- Mixed output formats within one Generation Job (node jgo8tv) — one format per batch; a caller wanting two formats submits two batches.
- Explicit empty-string text values via CSV (node jgo8tv) — an empty CSV cell always means omitted (default applies); JSON is the input format that can express "".
- Server-side persistence of single-render outputs (node jgo8tv) — the synchronous response is the delivery; only Generation Jobs persist outputs.
- A completed_with_errors job state (node jgo8tv) — completed covers runs with per-Row render failures; per-Row statuses carry the detail.
- SQLite as the database (node kjz6f0) — two runtimes write Job/Row state concurrently; Postgres chosen.
- A DB-backed task queue (node kjz6f0) — Redis + BullMQ chosen (official Python producer, Node consumer); Postgres stays the source of truth, Redis carries only the work signal (ADR-0004).
- Local-disk object storage (node kjz6f0) — an S3 API from day one; MinIO originally, Garage since node jl1ew8.
- MinIO as the object store (node jl1ew8) — upstream archived the repository, stopped publishing community images, and stripped the AGPL console; `minio/minio` is frozen at `RELEASE.2025-09-07T16-13-09Z` and will never receive another security fix, which is not a network service to ship inside self-hosted software. Garage (`dxflrs/garage:v2.3.0`) replaces it behind the same S3 API, with no change to any storage decision. Also rejected there: RustFS (drop-in, permissive licence, but `v1.0.0-alpha`), SeaweedFS (the fallback if Garage's AGPL flag ever costs more than it saves), and dropping the S3 API for a plain volume (cheapest, but it deletes the one-variable path to hosted object storage).
- Garage's own `--default-bucket` bootstrap (node jl1ew8) — the api creates its buckets on startup, as 0egsmf already specified; the bootstrap key carries `allow_create_bucket`, so the bucket name stays in one place instead of two that could disagree.
- Presigned storage URLs (node kjz6f0) — all file serving proxies through FastAPI, keeping the contract's immutable URLs stable and giving later auth one enforcement point.
- Direct Postgres writes from the render worker (node kjz6f0) — FastAPI owns the schema and Alembic migrations; the worker reports row results via an internal API endpoint (ADR-0005).
- Full recompile of the document on every gesture frame as the editor's preview strategy (node vnmueh) — measured 9.3 ms at 48 elements and 28.9 ms at 120, holding 60 fps only to ~60 top-level elements, with no headroom left for the rest of the frame. Memoized compile plus a patched DOM node costs under 1 ms at every size (ADR-0006).
- A cheap approximate render surface during gestures, with the true compiled SVG on release (node vnmueh) — rejected outright rather than traded against: patching the dirty element's DOM node was verified identical to a from-scratch recompile (worst bounding-box delta 0.0000 px across 236 elements), so no approximation is needed and the core spec's parity guarantee costs nothing.
- Selection handles rendered inside the editor's `<svg>` (node vnmueh) — identical JS cost to an HTML overlay, but a re-render destroys them mid-gesture along with their pointer capture and focus. Handles, guides, and marquee live in an HTML overlay above the SVG.
- Mutable in-place edits to editor document state (node vnmueh) — memoization keys on element object identity, so per-element immutability is load-bearing for the preview, not an optimization (ADR-0006).
- GIF and AVIF image uploads (node 3ko2p7) — GIF because animation is out of scope project-wide and silently dropping all but the first frame is a surprise; AVIF because encoder/decoder churn does not belong against a pinned Chromium. PNG, JPEG, and WebP only.
- SVG as an Image Asset (node 3ko2p7) — SVG already has an import path that flattens a file into vector elements; admitting it as an image would smuggle an unpinned second text-rendering surface into renders.
- Preserving the originally uploaded image bytes (node 3ko2p7) — images are normalized on upload (EXIF orientation applied, metadata stripped) and the normalized bytes are the Image Asset, hashed as stored. Keeping originals would mean two byte streams per image and a hash that the worker's verification does not match.
- Tracking which Design Documents reference an asset (node 3ko2p7) — deletion is unconditional and unindexed; a referencing design hard-errors by the existing missing-asset rule. FastAPI treats Design Documents as opaque JSON (ADR-0003), so any index would need a worker crossing and would have to stay correct forever (ADR-0007).
- Blocking asset deletion while Generation Jobs are in flight (node 3ko2p7) — same reason; affected Rows fail with the named missing-asset error, exactly as stored designs do.
- Soft deletion or tombstones for assets (node 3ko2p7) — a tombstone would collide with a later re-upload of the same bytes under the same content-addressed primary key, and nothing would be done with the knowledge. Deletes are hard; a re-upload revives every reference (within one Workspace — node ejy8hn scoped asset identity to (workspace_id, hash)).
- A single polymorphic `assets` table (node 3ko2p7) — font and image metadata share almost nothing; `font_assets` and `image_assets` avoid a table half full of nullable columns.
- A quarantine prefix or sweeper for rejected uploads (node 3ko2p7) — inspection precedes storage, so a rejected file never lands in object storage at all.
- A pasteboard, or any visible off-canvas staging area (node ep90f3, ADR-0008) — the editor's `<svg>` is the worker's markup, so content outside the canvas is clipped in the editor exactly as in the export. Selection handles live in the HTML overlay and are positioned from element bounds regardless of visibility, so an off-canvas element stays reachable and draggable.
- A grid, rulers, and user-dragged guides in the MVP (node ep90f3) — snapping is to canvas edges and center plus other elements' edges and centers, at a 6 px screen-space threshold. Alignment guides carry most of the value; the rest is a second interaction system to build and tune.
- Equal-spacing hint badges and on-canvas dimension measurements in the MVP (node ep90f3) — same reason.
- On-canvas gradient and shadow handles (node ep90f3) — the inspector is the single authority for every property; image Crop Mode is the one on-canvas exception, because a frame/content transform has no sane panel equivalent and is only ever judged by eye.
- A Scale tool (Figma's `K`) in the MVP (node ep90f3) — `Cmd` is already taken by snap-suspend so no modifier is free, and a modal tool for a rare operation is poor value. The accepted cost is an asymmetry: text and groups scale their strokes and shadows at their corners, while rect/ellipse/vector resize without touching them. Revisit if it bites in practice.
- A movable rotation pivot (node ep90f3) — the schema stores `rotation` about the element center only, so there is nothing else to rotate about.
- Non-uniform resize of a multi-selection (node ep90f3) — a rotated member would need a skew, which the schema cannot store; a multi-selection gets corner handles that scale uniformly.
- Element lock in the layer list in the MVP (node ep90f3) — no schema field exists for it, and editor-only fields in the Design Document were not opened here. Hiding is the document's own `visible` field, the same one a boolean Variable binds, so hiding in the editor hides in every render.
- SVG import of files containing text, gradients, patterns, filters, masks, or clip paths (node ep90f3) — rejected outright, naming what was found and suggesting the file be flattened or outlined first. An SVG `<text>` would smuggle a second, unpinned text-rendering surface into a render, which is the same reason SVG is not an Image Asset.
- View state in the Design Document (node ep90f3) — zoom and scroll offset persist per document in `localStorage`. Zoom is a CSS transform on a wrapper around the `<svg>`, never a recompile at a different scale, so the ADR-0006 memo caches survive every zoom change.

- A command/patch log as the editor's undo model (node 73rm0x) — ADR-0006's per-element immutability makes whole-document snapshots with structural sharing nearly free, and inverse-operation bugs are the classic undo failure mode. The undo stack is an array of document values.
- Persisting the undo stack across reloads (node 73rm0x) — in-memory only, capped at 200 entries; it would buy little once autosave is reliable and would cost a serialization format that needs migrating.
- An explicit-save workflow (node 73rm0x) — autosave, debounced ~1 s with a flush on tab hide/close; Cmd-S survives only as "flush now". Job snapshots already protect batches from mid-edit state.
- Merging concurrent edits, or live sync (node 73rm0x) — a revision-checked PUT returns 409 and the editor demands a reload; single user, the goal is preventing silent clobbering, not collaboration.
- Separate `designs` and `templates` tables (node 73rm0x) — one `documents` table with a kind column; unlike the asset tables (3ko2p7), the columns are 100% shared, and the editor opens either kind through one code path. A nullable promoted_from_id keeps lineage only.
- Server-side migration of stored documents (node 73rm0x) — FastAPI cannot run the TypeScript core (ADR-0003), so migration happens where core runs: the editor at load, the worker at snapshot load. FastAPI only stores bytes.

- Variable authoring on a design (node 8h50hu) — the Variables panel and bind controls exist only for kind='template'; promotion is the door. A design with Variables-but-not-a-template is an in-between state nobody needs.
- In-place Variable type change (node 8h50hu) — the type is fixed at creation; changing it is delete + recreate. A conversion matrix is edge rules for a rare operation.
- Editing text content on Variable delete (node 8h50hu) — deleting unbinds properties (default written back) but never rewrites text: `{{name}}` tokens stay literal and surface as Unknown Token warnings; re-creating the name revives them, matching the asset re-upload precedent.
- Blocking the editor on Unknown Tokens (node 8h50hu) — autosave never blocks and typing is never interrupted; the editor badges and warns, generation is the hard gate.
- A sample-value preview mode (node 8h50hu) — the defaults are the preview; the Generate dialog is where real values are seen, and its output is exactly the render.
- A naming dialog on promotion (node 8h50hu) — promote copies the name verbatim and enters the new template; rename happens in place.
- Promote-first as the only export path for designs (node 8h50hu) — the synchronous render endpoint accepts any document kind, so a plain design exports through the same Generate dialog.

- Non-Chromium browsers as a v1 editor target (node 9eooei) — only Chromium is ever verified against the worker's pinned engine; Firefox/Safari are untested but not gated.
- contenteditable as the text-editing surface (node 9eooei) — a second text renderer on screen mid-edit is the drift the architecture exists to prevent; input goes through a hidden textarea with the caret drawn from the compiler's own layout metrics.
- Pagination on the document and asset list endpoints in v1 (node 9eooei) — a personal library measured in dozens; all-records responses, newest first (per-workspace lists after node ejy8hn).

- JSON paste in the batch UI (node q44rtp) — the UI channel is CSV-only; the UI exists for the no-JSON-tooling case, and anyone holding JSON is one curl away from the API.
- An editable data grid in the CSV preview (node q44rtp) — the preview is a read-only shape check; fixes happen in the source file and are re-uploaded. An editable grid is a spreadsheet editor to build and maintain.
- Output thumbnails in the job view (node q44rtp) — succeeded Rows link to full-size files; the same derived-image cost the Assets-panel thumbnail Frontier item defers.
- Per-template jobs pages (node q44rtp) — one global Jobs page; single user, one place to find everything running or finished.
- Delete on a non-terminal job (node q44rtp) — cancel first; keeps each confirm dialog single-purpose.

- Registry-published images or a packaged one-script installer (node ex95f4) — the repo is the v1 distribution; compose builds api, web, and worker from the repo's Dockerfiles, keeping the Chromium/fontconfig pin authoritative in one Dockerfile shared by goldens, CI, and production.
- A separate production compose file (node ex95f4) — one root docker-compose.yml with profiles: infra on the default profile (dev behavior from kjz6f0 unchanged), api/web/worker/caddy behind `app`, so the pinned infra versions are stated once.
- Host-owned TLS in front of the stack (node ex95f4) — the in-stack Caddy owns it: DOMAIN set → automatic Let's Encrypt HTTPS, unset → plain HTTP for local use; the proxy choice is fixed to Caddy.
- Two exposed origins in production (node ex95f4) — Caddy is the single published port, routing / → web and /api, /assets, /jobs → api; the CORS `*` font carve-out (3ko2p7) is deleted outright by node ejy8hn (asset bytes are authenticated; dev uses credentialed CORS pinned to the editor origin).
- Manual production migrations (node ex95f4) — the api container runs `alembic upgrade head` on startup; `git pull && docker compose --profile app up -d --build` is the whole upgrade.
- A secret manager or secret auto-generation (node ex95f4) — a committed .env.example copied to a gitignored root .env, secrets via `openssl rand -hex 32`.
- A scheduled backup service in the stack (node ex95f4) — named volumes plus a documented manual backup/restore procedure (pg_dump, object-store volume copy) in docs/DEPLOYMENT.md.

## Notes

**claude** — 2026-08-14T20:30:19Z

v1-completeness sweep of the Frontier (2026-08-14, user-directed): every entry was checked against the settled record for whether it gates the first version. One entry split — the v1 self-hosted production deployment is now node ex95f4 (session:grill, ready; blocked on kjz6f0, 6lxoec, 2jpnag, all closed), while 'what productizing changes' stays on the Frontier. Every other entry stays deferred because a closed node already settled its v1 behavior: auth/API keys (product-later; jgo8tv auth-agnostic), CLI (post-MVP, ylg1wr), thumbnails, orphan sweeper, print PDF/CMYK, version history, migration mechanics (first bump), auto-layout, auto-fit text, smart crop, richer constraints, more bindable kinds, number formatting, editor perf beyond the preview (revisit if it bites), fleet scaling/webhooks/retention (post-v1 per jgo8tv/kjz6f0), template organization, emoji fallback, variable fonts. Implementation itself flows from the four spec issues via create-issues, not from the Frontier.

**claude** — 2026-08-14T20:36:23Z

Amendment to the v1 sweep (2026-08-14): the user pulled auth into v1. The Frontier entry 'Auth and API keys' moved wholesale into node ejy8hn (session:grill, ready; blocked on jgo8tv, kjz6f0, 3ko2p7, all closed). It coordinates with the deployment node ex95f4 — exposure sets the threat model — but neither blocks the other.

## Notes

**claude** — 2026-08-14T20:30:19Z

v1-completeness sweep of the Frontier (2026-08-14, user-directed): every entry was checked against the settled record for whether it gates the first version. One entry split — the v1 self-hosted production deployment is now node ex95f4 (session:grill, ready; blocked on kjz6f0, 6lxoec, 2jpnag, all closed), while 'what productizing changes' stays on the Frontier. Every other entry stays deferred because a closed node already settled its v1 behavior: auth/API keys (product-later; jgo8tv auth-agnostic), CLI (post-MVP, ylg1wr), thumbnails, orphan sweeper, print PDF/CMYK, version history, migration mechanics (first bump), auto-layout, auto-fit text, smart crop, richer constraints, more bindable kinds, number formatting, editor perf beyond the preview (revisit if it bites), fleet scaling/webhooks/retention (post-v1 per jgo8tv/kjz6f0), template organization, emoji fallback, variable fonts. Implementation itself flows from the four spec issues via create-issues, not from the Frontier.

**claude** — 2026-08-14T20:36:23Z

Amendment to the v1 sweep (2026-08-14): the user pulled auth into v1. The Frontier entry 'Auth and API keys' moved wholesale into node ejy8hn (session:grill, ready; blocked on jgo8tv, kjz6f0, 3ko2p7, all closed). It coordinates with the deployment node ex95f4 — exposure sets the threat model — but neither blocks the other.

**claude** — 2026-08-15T04:03:36Z

Extension after node ejy8hn (2026-08-15): the user reversed the multi-tenant exclusion — v1 is 'SaaS minus billing' (ADR-0009). Out of scope amended (billing/plans/quotas/metering stay out; password auth, instance admin/seed, and in-app signup allowlist added). Frontier gained OAuth/SSO, scoped API keys, and session-management-UI entries. New node u2ovlu (session:task, AFK): amend the published specs for workspace tenancy; spec node n60ho8 now also depends on it. Glossary gained an 'Accounts & access' section.

**claude** — 2026-08-15T04:08:51Z

Extension after node u2ovlu (2026-08-15): pure bookkeeping — the four published specs (1qoccb, 0egsmf, ek7pq1, wz3ev2) each carry a workspace-tenancy AMENDMENT note per ejy8hn/ADR-0009. No new Frontier entries, no exclusions. One derived decision flagged for review in the n60ho8 session: bundled fonts seed per Workspace at Workspace creation (forced by NOT NULL workspace_id on font_assets). Spec node n60ho8 is now unblocked.

**claude** — 2026-08-15T04:38:41Z

Extension after node n60ho8 (2026-08-15): the fifth and final spec is published — 88v6vg (Deployment and access), edges back to ex95f4, ejy8hn, u2ovlu. Every roadmap node is now closed; the root stays open only because the Frontier is not empty (all entries are post-v1 by the 2026-08-14 sweep). Out of scope gained User email-change/account-deletion (excluded during the spec rather than invented); the orphan-sweeper Frontier entry now also covers Workspace-delete orphans. The root body was also trimmed of note text earlier sessions had duplicated into it. Implementation flows from the five specs via create-issues — start with 88v6vg.
