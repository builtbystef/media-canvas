---
id: ek7pq1
title: Editor and asset pipeline
state: todo
labels:
    - spec
depends_on:
    - vnmueh
    - 3ko2p7
    - ep90f3
    - 73rm0x
    - 8h50hu
created: 2026-08-14T07:13:32Z
updated: 2026-08-24T09:11:41Z
---

## Problem Statement

The system can render a Design Document deterministically and generate assets from a Template by the thousands — but nothing can author one. There is no way to create a design, place and arrange elements, upload the fonts and images a design needs, promote a design to a Template, or get a file out without hand-writing JSON. The editor is the third pillar: everything the other two specs render has to come from somewhere.

## Solution

A Next.js web app with two pages: a document list, and an editor whose canvas *is* the compiled SVG — the same markup the worker renders, produced by the same shared core compiler, patched in place per gesture so editing runs at full frame rate at any document size. The editor speaks Figma's interaction grammar, holds the document as immutable snapshots with per-gesture undo, autosaves against a revision-checked PUT, and grows Variable authoring and a Generate dialog when the open document is a Template. FastAPI gains the asset write side: upload, list, and delete endpoints for Font Assets and Image Assets, feeding the editor's Assets panel, font picker, and drag-and-drop.

## User Stories

1. As a designer, I want to create a design from a Canvas Preset or custom dimensions, so that a new document starts at the size its channel needs.
2. As a designer, I want to edit with Figma's grammar — tools, selection, handles, snapping, shortcuts — so that I learn nothing new.
3. As a designer, I want the canvas to be exactly the markup the worker renders, so that exports never surprise me.
4. As a designer, I want to drop images onto the canvas and upload fonts from the font picker, so that assets enter the system where I need them, not in a separate admin step.
5. As a designer, I want one undo step per completed gesture, with selection restored on undo, so that undo shows me what changed.
6. As a designer, I want autosave with a visible indicator, so that closing the tab never loses work.
7. As a designer, I want to be told when the document changed elsewhere instead of silently overwriting it, so that no save clobbers another.
8. As a template author, I want to promote a design into a Template and declare typed Variables, so that generation can consume it.
9. As a template author, I want unknown `{{name}}` tokens badged and fixable while I type, so that a broken Template cannot ship silently.
10. As a designer or template author, I want a Generate dialog that downloads a rendered file, so that one-off output is one click from the canvas.
11. As a designer, I want a missing asset to block the preview with a named error and a replace action, so that a design referencing a deleted asset is never unopenable.
12. As a user, I want an Assets panel that lists, uploads, and deletes fonts and images with a plain warning about consequences, so that the library stays manageable.

## Implementation Decisions

### Application shell

- Two routes: the document list at the root, and the editor at a per-document URL, opening either kind through one code path.
- **Document list**: backed by `GET /api/v1/documents`; filter tabs All / Designs / Templates; one row per document with name, kind, and last-updated, sorted by last-updated descending; per-row actions: open, promote (designs, per node 8h50hu), delete with a confirm dialog. A "New design" button opens the creation dialog. No search, folders, or duplication.
- **Creation dialog**: pick a Canvas Preset — Instagram post 1080×1080, Instagram story 1080×1920, Facebook post 1200×630, X post 1600×900, A4 poster 2480×3508, Full HD 1920×1080 — or type custom width×height. Creates a `kind: 'design'` document named "Untitled" with a white solid background and no elements, then opens the editor. The preset list is a constant in the web app; presets carry no behavior beyond name and dimensions.
- **Editor chrome**: top bar with the document name (rename in place), the saving/saved indicator, "Promote to Template" (designs) and "Generate" buttons, and a "promoted from" link on templates with lineage. Left side: panels for Layers, Assets, Shapes, and — templates only — Variables. Right side: the inspector. Center: the canvas.
- **Theme**: light and dark following the system preference, stock shadcn tokens, no in-app toggle. The canvas is theme-independent — it renders the document's own background.
- **Browser support**: Chromium-based browsers only. No user-agent gate; other browsers are simply untested.

### Frontend architecture

- React owns the shell, panels, inspector, dialogs, and the HTML overlay. The compiled SVG lives in a container element React never reconciles: mounted once, then mutated imperatively by the preview layer below. This split is load-bearing — per-gesture DOM patching (ADR-0006) cannot coexist with reconciliation over the same nodes.
- **State**: one Zustand store, holding the current document value, the undo and redo stacks (arrays of document values), the selection (element ids plus the entered-group path), the active tool, and transient gesture state. Document mutation goes exclusively through pure operation functions `(DesignDocument, args) → DesignDocument` that replace changed elements and their ancestor groups and preserve the object identity of everything untouched — the memo caches key on element identity (ADR-0006), so this purity is a correctness requirement, not style. Representative shapes:

```ts
// pure document operations — the unit-test seam
function moveElements(doc: DesignDocument, ids: string[], dx: number, dy: number): DesignDocument
function scaleGroup(doc: DesignDocument, id: string, factor: number): DesignDocument
function renameVariable(doc: DesignDocument, from: string, to: string): DesignDocument
```

- Undo/redo moves a pointer over the snapshot array; a new edit clears the redo stack; the stack is in-memory only, capped at 200 entries (node 73rm0x).

### Canvas preview (ADR-0006, node vnmueh)

- The preview is the shared core compiler's output, inline in the DOM. Compilation memoizes per element on object identity in two caches — line breaking (text) and emitted markup (all types).
- A gesture frame patches only the dirty element's DOM node (< 1 ms at every measured size). A change that dirties the whole document — load, font change, canvas resize, undo of a multi-element edit — does a full compile and accepts ~11–30 ms.
- Selection handles, rotation zones, marquee, snap guides, badges, and the text caret live in the HTML overlay above the SVG, positioned from element bounds. Hit-testing goes through `elementFromPoint` against the SVG, walked up to the nearest element-id attribute.
- **Assets in the browser**: the editor implements the core's `AssetResolver` over the asset endpoints — font bytes are fetched once per Font Asset and parsed by the compiler; a matching `@font-face` rule is injected per used Font Asset so the SVG text displays in the real face. Image URLs pass through as the immutable serving URLs.
- **Zoom** is a CSS transform on a wrapper around the SVG, never a recompile at a different scale; the memo caches survive every zoom change. Range 5%–1600%. Zoom and scroll offset persist per document in `localStorage`; first open lands on zoom-to-fit. Nothing about the view enters the Design Document.

### Interaction model (node ep90f3, normative here)

Figma's grammar minus what schema v1 cannot express. The complete rules — tool palette (Select V, Text T, Rectangle R, Ellipse O, Hand H; draw one, return to Select), selection (top-level click, double-click to enter groups, Cmd/Ctrl-click deep select, Shift add/remove, intersecting marquee), per-type handle behavior (Resize for rect/ellipse/vector; Scale for text, images, and groups; Crop Mode inside images), rotation about the element center with Shift 15° snapping, snapping to canvas and element edges/centers at 6 px screen-space with Cmd/Ctrl suspend, the six align and two distribute actions, pan/zoom bindings, the full keyboard map, text creation defaults, new-shape defaults, canvas-change semantics, off-canvas clipping (ADR-0008), and SVG import with its reject list — are settled in node ep90f3's closure note and bind this spec verbatim. The inspector is the single authority for every property; image Crop Mode is the one on-canvas exception.

### Text editing

- Entering text editing (double-click or Enter on a text element) focuses a hidden textarea holding the element's raw content, including literal `{{name}}` tokens. Keystrokes mutate the document through the store; the displayed text is always the compiled SVG — no contenteditable, no second text renderer, ever.
- The caret and selection highlight are drawn in the HTML overlay from the compiler's own layout data. The core package gains one export for this, implemented inside the same line-breaking code the compiler uses (never a re-implementation):

```ts
// new export from the shared core package
function layoutText(el: TextElement, fontBytes: ArrayBuffer): TextLayout
type TextLayout = {
  lines: Array<{ start: number; end: number; baselineY: number }>  // content index range per line
  positions: number[]  // x of each character boundary, per line concatenated
}
```

Both directions come from it: content index → canvas x/y for the caret, and click point → content index for caret placement and drag selection.
- Typing `{{` in a template pops the Variable autocomplete (node 8h50hu); free typing stays allowed. A text element left empty on exit is deleted.

### Document state and persistence (node 73rm0x, normative here)

- Whole-document immutable snapshots with structural sharing; one Undo Entry per completed gesture exactly as node 73rm0x defines (drag = one entry, text-editing session = one entry, inspector scrub coalesces on release, typed field commits on blur/Enter); selection restores to the touched elements on undo.
- **Autosave**: debounced ~1 s after the last mutation, immediate flush on tab hide/close, Cmd-S is "flush now". The indicator shows saving/saved. A non-409 save failure (network, 5xx) never interrupts editing: retry with exponential backoff (1 s doubling to a 30 s cap) and flip the indicator to a warning until a save lands.
- **Concurrency**: every PUT carries the loaded Revision; a 409 shows a blocking "changed elsewhere — reload" notice. No merging.
- **Migration**: a stored document older than the current `schemaVersion` migrates at load in the editor via the core package; the next autosave persists the current version. FastAPI never migrates (ADR-0003).
- **Documents API** (FastAPI, table per node 73rm0x — one `documents` table with `kind`, `revision`, `promoted_from_id`):

```
POST   /api/v1/documents            { kind: 'design', name, document } → 201 DocumentView (revision 1)
GET    /api/v1/documents?kind=      → DocumentSummary[]   (no document body; updated_at desc)
GET    /api/v1/documents/{id}       → DocumentView
PUT    /api/v1/documents/{id}       { document, revision, name? } → 200 { revision, updatedAt } | 409
DELETE /api/v1/documents/{id}       → 204
POST   /api/v1/documents/{id}/promote → 201 DocumentView   (new row, kind 'template', document copied,
                                        promoted_from_id set, name copied verbatim; 422 on a template)

type DocumentSummary = { id, kind: 'design'|'template', name, schemaVersion,
                         revision, promotedFromId: string|null, createdAt, updatedAt }
type DocumentView = DocumentSummary & { document: DesignDocument }
```

### Template authoring and generation (node 8h50hu, normative here)

- The Variables panel and every bind control appear only when `kind = 'template'`; promotion is the door. Promote navigates straight into the new copy.
- Binding, chips, unbind write-back, the Variables panel rows (name, type, typed default control, minLength/maxLength, usage count), the name grammar `^[A-Za-z][A-Za-z0-9_]*$`, rename rewriting `$var` refs and `{{name}}` tokens in one Undo Entry, delete unbinding-but-never-editing-text, Unknown Token badging with one-click fixes, and defaults-as-preview all bind verbatim from node 8h50hu's closure note.
- **Generate dialog**: reached from the top bar on both kinds. For a template: one typed input per Variable prefilled with defaults, constraints enforced inline, plus the output-format picker (PNG scale 1/2/3, JPEG quality, PDF). For a design: the format picker only. Calls `POST /api/v1/documents/{id}/render` (spec 0egsmf as amended) and hands the response bytes over as a browser download. Nothing persisted.

### Asset pipeline (node 3ko2p7, normative here)

- All sixteen items of node 3ko2p7's closure note bind this spec: worker-side font inspection via `POST /internal/fonts/inspect`, Pillow image inspection and EXIF normalization in FastAPI, bundled-font seeding at startup, the upload/serve/delete endpoints, upload sequences and dedupe-by-hash returning 200, format and size limits with their 422 error codes, the two-bucket flat key layout, the `font_assets` / `image_assets` tables, unconditional unindexed deletion (ADR-0007) with the bundled-font 409, delete confirms, and the serving headers (CORS `*`, immutable cache).
- New here, closing the one gap the node left: **list endpoints** —

```
GET /api/v1/fonts   → FontAssetView[]    (all records, newest first, unpaginated)
GET /api/v1/images  → ImageAssetView[]

type FontAssetView  = { id, format: 'ttf'|'otf', family, subfamily, weight, italic,
                        postscriptName, byteSize, bundled, originalFilename, createdAt, url }
type ImageAssetView = { id, contentType, width, height, byteSize,
                        originalFilename, createdAt, url }
```

`url` is the immutable serving URL with its cosmetic suffix.
- **Editor surfaces**, per node 3ko2p7: image drag-and-drop and paste with immediate upload and placeholder-borne progress/errors; the font picker's inline "Upload font" with inline rejections; the Assets panel with Images (thumbnail grid pointing at full-size URLs) and Fonts (rows in their own face, bundled families grouped and marked, no delete on bundled) sections, each with an upload control; drag from panel to canvas places without an upload.
- **Missing-asset panel**: a missing Font or Image Asset replaces the preview with a blocking error panel naming each missing asset id and the referencing elements by name, with a per-asset Replace action opening the matching picker; replacement rewrites the references and restores the preview. Layout, panels, and the document remain interactive enough to reach Replace; nothing else renders.

## Dependencies

- **next** + **react** — the web app framework, a stack constraint from the roadmap goal.
- **zustand** — the document/undo/selection store; store-outside-React fits the imperative canvas, gesture code reads and writes without render churn.
- **tailwindcss** — styling (user choice).
- **shadcn/ui, Base UI variant** — component primitives for panels, dialogs, inspector controls (user choice).
- **vitest** — unit runner for the store-operation seam.
- **@playwright/test** — the e2e smoke; the browser itself is already pinned by the core spec's Playwright dependency.
- **Pillow** (api) — image inspection and EXIF normalization (node 3ko2p7).
- **python-multipart** (api) — FastAPI multipart upload parsing.

No other dependency may be added by an implementation session without amending this section. opentype.js, zod, playwright, boto3, Alembic and the rest are owned by the core and generation specs.

## Testing Decisions

Three seams, agreed:

1. **Document operations / store** (Vitest, pure TypeScript — the editor's real logic, no browser). Worked examples: `moveElements` on `{x: 10}` with `dx: 5` → `x: 15`, untouched elements keep object identity; `scaleGroup` factor 2 doubles a descendant text's `fontSize`, `letterSpacing`, and shadow `dx/dy/blur`; rect resize leaves `border.width` untouched; a 120-frame drag produces one Undo Entry; undo of a two-element move restores both positions and selects exactly those two; `renameVariable` rewrites `{ $var: 'old' }` and `Price: {{old}}` in one entry, and rejects a colliding name; unbind writes the Variable's current default back as the authored value; deleting a Variable leaves `{{name}}` literal in content and the token reports as Unknown; a text element emptied on exit is removed from the document.
2. **FastAPI endpoints** (test client; storage and worker inspection faked behind their contracts). Worked examples: PUT with a stale revision → 409, document unchanged; successful PUT → revision incremented by exactly 1; promote on a design → new row with `kind: 'template'`, `promoted_from_id` set, `revision: 1`, name copied; promote on a template → 422; `GET /documents?kind=template` excludes designs; re-uploading identical image bytes → 200 with the existing id, one row; delete of a bundled font → 409 `asset_is_bundled`; font list → bundled and uploaded records with `bundled` flags.
3. **One Playwright e2e smoke** against the real dev stack: create a design from a preset, draw a rect and a text, watch the indicator reach saved, reload and find the document intact, promote it, declare and bind a Variable, generate a PNG and receive the download. One scripted pass — fine-grained behavior lives at seam 1.

External behavior only at every seam. Prior art: none in-repo; the core spec's seam-1 test style is the model.

## Out of Scope

- The batch generation UI — its own roadmap node (q44rtp).
- Repository and workspace layout — deliberately deferred to the checks issue (g4y1ii), which owns the stack grill; this spec names packages, never paths.
- Document version history; thumbnails and derived images; template galleries, search, folders, duplication (Frontier).
- Element lock; grid, rulers, user guides, spacing badges, dimension labels; a Scale tool; movable rotation pivot; non-uniform multi-select resize (node ep90f3).
- A sample-value preview mode; Variable retype; an in-between design-with-Variables state (node 8h50hu).
- Persisting the undo stack; explicit-save workflow; merge or live sync (node 73rm0x).
- Firefox/Safari support; auth and API keys; everything the core spec (schema, compiler, validation, render) and generation spec (jobs, queue, file proxying) own.

## Further Notes

- The governing invariant, restated: the editor's `<svg>` is the worker's markup. Anything the editor can show that the compiler cannot express is a bug in the editor (core spec 1qoccb). `layoutText` must therefore be the compiler's own layout code exposed, never a parallel implementation.
- ADRs binding this spec: 0003 (TypeScript core), 0005 (api owns the schema), 0006 (immutable elements, memoized preview), 0007 (unindexed asset deletion), 0008 (no pasteboard).
- Glossary terms exercised here: Design Document, Element, Template, Variable, Unknown Token, Canvas Preset, Preset Shape, Resize, Scale, Crop Mode, Undo Entry, Revision, Font Asset, Image Asset, Fit Mode.
- The `layoutText` export and the two asset list endpoints are the only additions this spec makes to surfaces other specs own; both are additive and were raised here rather than silently implemented.

## Notes

**claude** — 2026-08-15T04:08:18Z

AMENDMENT (node u2ovlu, per node ejy8hn / ADR-0009, 2026-08-15): v1 is multi-tenant — Workspaces own documents and assets. What changes in this spec:

- Schema: `documents`, `font_assets`, `image_assets` each gain a NOT NULL `workspace_id` FK. Asset identity becomes (workspace_id, hash): dedupe-by-hash-returning-200 and "a re-upload revives every reference" hold within one Workspace only; the same bytes in two Workspaces are two rows and two stored objects.
- Bundled fonts: because every `font_assets` row now carries `workspace_id` (no nullable carve-out in ejy8hn's note), the 9 bundled families are seeded per Workspace at Workspace creation (idempotent), not once at app startup. The `bundled` flag, the panel grouping, and the delete-409 `asset_is_bundled` behavior are unchanged. [Derived consequence, not in the ejy8hn note verbatim — flagged for the n60ho8 spec session to confirm.]
- Routes: collection/create endpoints become Workspace-scoped — `POST/GET /api/v1/workspaces/{wsId}/documents`, `GET .../fonts`, `GET .../images`, and the font/image upload endpoints likewise. Item routes (document GET/PUT/DELETE, promote, asset serve/delete) stay id-based, authorized by the record's Workspace × the caller's Membership. Asset serving URLs carry the Workspace (it is half the asset's identity); they remain immutable, but authenticated.
- Serving headers: the CORS `*` font carve-out (node 3ko2p7) is deleted. Production is same-origin behind Caddy; dev uses credentialed CORS pinned to the editor origin, with the SameSite=Lax session cookie — the editor fetches font bytes and images with credentials. Immutable caching survives as `Cache-Control: private, immutable`.
- Web app: the shell gains a workspace switcher; the document list and Assets panel list the current Workspace's records (9eooei's no-pagination rule survives per Workspace). Sign-in, workspace creation, invites, members, and API-key UI belong to node n60ho8's spec, not here.
- RBAC on this surface: document mutation (create, PUT, delete, promote, rename) and asset upload/delete require Editor or Owner; Viewer is read/download only.

**claude** — 2026-08-15T04:14:08Z

Re the flagged bundled-font decision (2026-08-15): the user reviewed it — per-Workspace seeding at Workspace creation stands as written (a few MB per workspace is the accepted cost of zero special cases in scoping, auth, and deletion). n60ho8 confirms it as part of its spec; no re-litigation needed unless that session surfaces something new.

**claude** — 2026-08-15T05:49:53Z

CROSS-SPEC CONSEQUENCE (from the 1qoccb issue-slicing session, user decided 2026-08-15): the compiler now emits a self-contained `@font-face` block with the Font Asset bytes inline, so the compiled SVG needs no font wiring from its host. This spec's "Canvas preview" line — "a matching @font-face rule is injected per used Font Asset so the SVG text displays in the real face" — is therefore obsolete: the editor still fetches font bytes once per Font Asset for the compiler's metrics, but must not inject font rules of its own. See the SEAM DECISIONS note on 1qoccb.

**claude** — 2026-08-15T06:24:11Z

Two issues under spec 88v6vg are blocked on this spec and currently point their blocking edge at this umbrella: vn4r07 (seed the bundled fonts into a new Workspace) and 36ty5a (purge a deleted Workspace's stored objects). The accounts work builds Workspace creation and deletion without them, because both need the Font Asset records and object storage this spec owns. When this spec is sliced, retarget those two edges from ek7pq1 to the specific slices that land asset storage.

**claude** — 2026-08-15T06:55:09Z

From the 0egsmf issue-slicing session (2026-08-15). Two things this spec's slicing session inherits.

1. THREE MORE ISSUES POINT THEIR BLOCKING EDGE AT THIS UMBRELLA, alongside vn4r07 and 36ty5a: lkey79 (the synchronous render endpoint) and kjsmdy (job submission and polling) both read a stored document, and thh7aw (the documented bootstrap and the end-to-end smoke) needs a Template carrying a bundled font and a held image. Retarget all three when this spec is sliced — the first two to the slice that lands the documents table, the third to the slice that lands asset storage.

2. THIS SPEC OWES THE WORKER AN INTERNAL ASSET-BYTES PATH. The user settled (see the SEAM DECISIONS note on 0egsmf) that the worker loads every font and image itself and inlines them, so the render page fetches nothing, and that those bytes come from the api under INTERNAL_API_TOKEN rather than from object storage directly — the api stays the only thing that reads asset rows and knows the key layout. The asset tables and their storage layout are this spec's, so the internal endpoint that serves those bytes to the worker belongs here. It takes a Workspace and an asset id, because asset identity is (workspace_id, hash). Issue 1dxm2u builds the worker's side against that contract with the source stood in.

**claude** — 2026-08-15T07:13:26Z

Sliced 2026-08-15 into 22 sub-issues. Two decisions taken during slicing, both by the user. (1) The compiler's inlined font bytes (the seam decision on 1qoccb) land inside this spec's ADR-0006 compile budget, so the font-face block is its own memo entry keyed on the set of used Font Assets: a full recompile re-emits it only when that set changes and a per-element patch never touches it. Issue n5csrl carries an acceptance criterion that measures both budgets with fonts inlined, at the preview prototype's document sizes, rather than assuming they still hold. Rejected: a prototype session first (the measurement is cheap enough to be a criterion), and building it plainly with no criterion. (2) Two slices stop for user review before their dependents unblock — n5csrl (the canvas) and glkll2 (rotation, snapping, alignment) — because the preview's fidelity and the geometry aids' feel are judged by eye, not by criteria. The internal asset-bytes path this spec owed the render worker is in jr6mye. Bundled-font seeding stays with vn4r07 under spec 88v6vg; this spec only carries the bundled flag and the delete refusal.

**claude** — 2026-08-19T11:06:49Z

AMENDMENT to Dependencies (built on 21plhn, 2026-08-19): the api gains two runtime dependencies. python-multipart is the one this section already names. httpx is not named here and is added: FastAPI's asset upload has to call the worker's internal service, the api had no HTTP client, and httpx was already in the tree and the lockfile as apps/api's dev dependency (TestClient runs on it), so promoting it to a runtime dependency adds nothing new to the dependency graph and gives the async routes an async client. Rejected: urllib.request in a threadpool, which hand-rolls timeouts and error mapping for no gain. Also settled while building: the worker's font-inspection route is POST /fonts/inspect, not node 3ko2p7's /internal/fonts/inspect - the worker's internal service mounts /validate with no prefix (gxwr7t, and 0egsmf's contract), and every route on it is internal.

**claude** — 2026-08-24T08:44:34Z

AMENDMENT to Dependencies (built on hq3p33, 2026-08-24): the stack this section names is ADOPTED, not amended away. The user decided it directly. `apps/web` is now Tailwind v4 + shadcn/ui, Base UI variant, and the two slices that had shipped in plain CSS (jmpc8g, hg52gb) plus everything built on them since (gw6v31's inspector, glkll2's geometry aids) are converted. What this section owes a later session:

- WHAT ACTUALLY GOT INSTALLED. `tailwindcss` and `@tailwindcss/postcss` are the Tailwind half; Tailwind v4 has no JS config, so `apps/web/postcss.config.mjs` is the whole wiring and the theme is CSS. The shadcn half is not one package — the registry writes components into the repo, and they are written against `@base-ui/react` (the primitives), `class-variance-authority` (the variant tables), `clsx` + `tailwind-merge` (the `cn` helper), `lucide-react` (the icons), and `tw-animate-css` (the enter/exit keyframes). Those five are what `shadcn init` installs alongside the components: they are this section's named dependency arriving, not new ones, and the reasons are also in `pnpm-workspace.yaml`'s catalog.
- THE `shadcn` PACKAGE ITSELF IS DELIBERATELY ABSENT. Upstream's `globals.css` opens `@import "shadcn/tailwind.css"`, which needs the CLI package as a project dependency. This workspace's `trustPolicy: no-downgrade` refuses its dependency tree (`@babel/core` -> `semver@6.3.1`, provenance dropped between releases). That file is vendored verbatim at `apps/web/app/shadcn.css` instead — byte-identical to shadcn 4.19.0's `dist/tailwind.css`, excluded from the formatter in `vite.config.ts`, with the refresh command in its header. Do not "fix" this by installing `shadcn`; the supply-chain policy is the older decision.
- STYLE AND THEME. `components.json` pins `style: "base-nova"` — the `base-*` prefix is what selects Base UI over Radix — with `baseColor: "neutral"`, which is what "stock shadcn tokens" resolves to today. Dark is the system's: Tailwind v4's `dark:` variant already means `prefers-color-scheme: dark`, so the variant is left alone, upstream's `@custom-variant dark (&:is(.dark *))` is deleted, and the dark token values sit under that media query. There is no `.dark` class and no `next-themes`.
- ONE DEPARTURE FROM THE PRESET, ON PURPOSE. `nova` ships Geist through `next/font/google`. `--font-sans` stays the system stack instead, so rendering a page fetches nothing at build time. Change it by editing that one token in `app/globals.css`.
- ADDING A COMPONENT. `npx shadcn@latest add <name>` from `apps/web`. It reads `components.json`, writes into `components/ui`, and installs into the workspace catalog. If it reaches for the `shadcn` package again, generate in a scratch project outside the workspace and copy the files across, as this session did.

**claude** — 2026-08-24T09:11:41Z

CORRECTION to the amendment above, same session, after the user reviewed it. Two of its bullets are now wrong — read this one instead.

- THE `shadcn` PACKAGE IS A DEPENDENCY AFTER ALL. Do not vendor `tailwind.css`. The user's call: the trust-downgrade that blocked it is `semver@6.3.1`, a 2023 release under `@babel/core` that simply predates provenance — not a signal of anything. `pnpm-workspace.yaml` now carries `trustPolicyExclude: [semver]` next to `trustPolicy: no-downgrade`, with that reason in a comment, and `shadcn` installs as a devDependency of `apps/web` (build-time only — `app/globals.css` imports `shadcn/tailwind.css` and nothing ships it at runtime). `apps/web/app/shadcn.css` is deleted, and so is the formatter carve-out that existed for it in `vite.config.ts`. Note that `minimumReleaseAge` holds the version at 4.18.0 while the registry serves 4.19.0 components; the `tailwind.css` in both is byte-identical, so this is not a mismatch to worry about.
- GEIST IS THE FACE, as the preset ships it. `next/font/google` self-hosts it — the woff2 files are emitted into the build and the browser fetches nothing from Google — so the "fetches nothing at build time" reasoning that argued for the system stack was the wrong trade to make.
- ONE THING TO KNOW IF YOU TOUCH THE FONT WIRING. `next/font` is given `variable: "--font-geist"`, not upstream's `--font-sans`, and `@theme inline` maps `--font-sans: var(--font-geist), system-ui, sans-serif`. Upstream points both at `--font-sans`, which lands two declarations of one custom property on `<html>` — one of them `--font-sans: var(--font-sans)`. That is a cycle, and CSS answers a cycle by dropping the property, so whether the face survives comes down to which declaration the cascade happens to pick. Separate names remove the question. Verified in the built CSS: `--font-geist:"Geist", "Geist Fallback"` on the document element, `html{font-family:var(--font-geist), system-ui, sans-serif}`.

Everything else in the amendment above stands: the dependency list, `style: "base-nova"` at `baseColor: neutral`, dark as `prefers-color-scheme` with no `.dark` class and no `next-themes`, and `npx shadcn@latest add <name>` from `apps/web` — which now needs no scratch-project workaround.
