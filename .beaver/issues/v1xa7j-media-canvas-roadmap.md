---
id: v1xa7j
title: Media Canvas — roadmap
state: in-progress
assignee: builtbystef
labels:
    - roadmap
created: 2026-08-08T07:08:13Z
updated: 2026-08-10T03:21:33Z
---

## Goal

A running web app where the user designs a static visual asset (Instagram post, poster, ad, website graphic) in a visual editor; the design is saved in a structured, versioned format; any design can be promoted to a template with variable slots (text, images, colors, prices); and assets are produced from templates one-off in the UI or by the hundreds/thousands via API, CLI, or batch data upload — with background workers doing the rendering, and exported output matching what the editor showed.

Stack constraints given by the user: Next.js frontend, FastAPI backend. Audience: the user themselves first, self-hosted — but built so productizing later (accounts, API keys, tenancy) is not blocked.

## Frontier

- Editor UX details: canvas interactions, tool set, selection/alignment model, undo/redo.
- Auth and API keys: how the "me first, product later" constraint translates into an account model.
- CLI: what it wraps, its language, how it is distributed. (Post-MVP per node ylg1wr — a thin client of the generation API.)
- Image/asset upload pipeline and storage layout.
- Print-ready PDF export (CMYK, bleed/trim marks) and color management. (Digital RGB PDF, JPEG, and PNG are in the MVP per node ylg1wr; the engine verdict gqr8bf makes digital PDF a vector printToPDF output.)
- Design document migration mechanics as the format version advances. (Strategy settled by node 53lwlc — required integer schemaVersion, forward-only migrations applied at load, renderer accepts only the current version; the mechanics land with the first version bump.)
- Auto-layout / resize anchoring — v1 is absolute positioning only (node 53lwlc); template reuse across canvas sizes may want it in a later version.
- Auto-fit text: shrink font until content fits a fixed box, for batch generation (node 53lwlc) — v1 wraps at fixed width with auto height from a vertical anchor instead.
- Bindable property kinds beyond v1's text content / image source / solid color / number / visibility: geometry, fonts, opacity (node 53lwlc).
- Formatting of price/number variables, localization.
- Deployment story: self-host now, what productizing changes. (The engine verdict gqr8bf adds a hard input: the worker ships as a pinned container image — pinned Chromium build, one pinned headless flavor, fontconfig-pinned fonts.)
- Worker fleet scaling, retry semantics, observability. (Measured baseline from node gqr8bf: ~166 ms/render at 8 concurrent pages in one browser instance, ≈2.8 min per 1,000 assets on one host.)
- Template organization: galleries, search, duplication.

## Out of scope

- Animated or video assets — the product is static visuals only.
- Multi-tenant SaaS features in the MVP (billing, teams, orgs) — design must not block them, but none are built now.
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
