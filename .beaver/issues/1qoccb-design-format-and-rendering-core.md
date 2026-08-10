---
id: 1qoccb
title: Design format and rendering core
state: todo
labels:
    - spec
depends_on:
    - 53lwlc
    - 7mza2q
    - gqr8bf
    - k77nv9
    - oxcf2v
    - ud46e4
created: 2026-08-10T19:14:32Z
updated: 2026-08-10T19:14:32Z
---

# Design format and rendering core

## Problem Statement

A designer builds a static visual asset in a browser editor and later produces hundreds or thousands of variants of it from data. Nothing of that works unless three things hold at once: the design is stored in a format that captures everything the editor can author; a Template's Variables behave predictably when real data hits the edges; and the file a worker exports matches what the editor showed — every time, including a year later. Without a settled core, the editor, the workers, and the generation API would each interpret designs their own way and drift apart.

## Solution

One project-owned JSON schema — the Design Document — is the single source of truth. One shared TypeScript package owns the schema types, the Variable validation, and a deterministic compiler from Design Document to SVG markup. The Next.js editor renders that compiled SVG in the browser; the render worker screenshots the identical SVG in pinned headless Chromium and prints the PDF from it. Fonts and images are content-addressed assets served from the app's own storage, so both sides load byte-identical inputs. Fidelity regressions are caught by a small golden-image fixture suite with measured perceptual tolerances.

## User Stories

1. As a designer, I want my design saved in a structured, versioned format, so that the editor can always reopen it and future schema changes migrate it instead of breaking it.
2. As a designer, I want the exported PNG/JPEG/PDF to match what the editor showed, so that I never proof-check renders against the canvas.
3. As a template author, I want to promote a design to a Template with typed Variables, so that assets can be generated from data without touching the editor.
4. As a batch operator, I want a row with bad values rejected before rendering with an error naming the Variable, so that a 1,000-asset batch never silently ships placeholder or clipped output.
5. As an operator, I want renders to be deterministic in a pinned worker environment, so that regression tests and re-renders are trustworthy.
6. As a developer, I want one compiler shared by editor and worker, so that no second rendering implementation exists to drift.

## Implementation Decisions

### Architecture

- **One shared TypeScript package** (the *core*) owns: the Design Document schema types, document validation, Variable value validation, value substitution, and the JSON→SVG compiler. The Next.js editor and the render worker consume this package verbatim. FastAPI orchestrates jobs and storage and never interprets document internals.
- **The render worker is Node + Playwright, written in TypeScript.** It loads the compiled SVG and screenshots it (`captureScreenshot`) or prints it (`printToPDF`).
- **Pinned headless flavor: full Chromium new headless** (Playwright `channel: 'chromium'`), not `chrome-headless-shell` — the same rendering path as the desktop Chrome the editor runs in. The worker ships as one pinned container image: pinned Chromium/Playwright pair, fontconfig pointed at the app's font set and nothing else (ADR-0002).
- **Compiled markup is SVG.** The compiler computes text line breaks itself (opentype.js advance widths) and emits fixed `<tspan>` lines, so wrapping cannot drift between editor and worker.
- **Assets are content-addressed.** A Font Asset (TTF/OTF) and an Image Asset are each one file whose id is the hash of its bytes, served from app storage at an immutable URL. The worker verifies the hash on load. No external font CDN at render time, ever.

### Render pipeline

`validate(template, values)` → `resolve` (apply values and defaults, producing a plain Design Document with no Variables) → `compile(document, assets)` → SVG → editor `<svg>` inline render, or worker `render(svg, options)`.

Validation runs entirely before rendering: a row fails fast with a named-Variable error, or renders completely. A render never half-fails on values (node k77nv9).

### Document schema (v1)

Complete type shapes — these are the contract at the seams:

```ts
type DesignDocument = {
  schemaVersion: 1                       // required integer; forward-only migrations at load
  canvas: { width: number; height: number; background: Fill | VarRef }
  variables?: VariableDecl[]             // a Template is a Design Document with Variables declared
  elements: Element[]                    // paint order: first = bottom
}

type Color = string                      // '#RRGGBB' | '#RRGGBBAA'
type VarRef = { $var: string }           // binds a property to a Variable by name
type GradientStop = { offset: number; color: Color }          // offset 0..1
type LinearGradient = { type: 'linear'; angle: number; stops: GradientStop[] }  // angle deg, 0 = left→right, clockwise
type RadialGradient = { type: 'radial'; stops: GradientStop[] }                  // centered in the element bbox
type Fill = Color | LinearGradient | RadialGradient
type Shadow = { dx: number; dy: number; blur: number; color: Color; opacity: number }
type Border = { color: Color | VarRef; width: number }        // stroke centered on the edge
type CornerRadius = number
  | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }

type ElementBase = {
  id: string                             // unique in the document
  name?: string                          // editor layer list only
  x: number; y: number                   // px, floats allowed; origin top-left, y down
  rotation: number                       // degrees, clockwise, about the element center
  opacity: number                        // 0..1
  visible: boolean | VarRef              // boolean Variables bind here
}

type RectElement = ElementBase & {
  type: 'rect'; width: number; height: number
  fill: Fill | VarRef
  cornerRadius?: CornerRadius
  border?: Border; shadow?: Shadow
}

type EllipseElement = ElementBase & {
  type: 'ellipse'; width: number; height: number
  fill: Fill | VarRef
  border?: Border; shadow?: Shadow
}

type VectorElement = ElementBase & {
  type: 'vector'; width: number; height: number
  path: string                           // one SVG path (d), local coordinates
  viewBox: { width: number; height: number }  // natural bounds of `path`; compiler scales to width×height
  fill: Fill | VarRef
  border?: Border; shadow?: Shadow
}

type ImageElement = ElementBase & {
  type: 'image'; width: number; height: number   // the frame; content outside is clipped
  src: string | VarRef                   // Image Asset id
  naturalWidth: number; naturalHeight: number    // intrinsic px of the authored asset
  content: { offsetX: number; offsetY: number; scale: number }  // authored crop of the placeholder
  fitMode: 'cover' | 'contain' | 'stretch'       // places a Variable-supplied image; default 'cover'
  clip: 'none' | 'ellipse' | { path: string }
  cornerRadius?: CornerRadius
  border?: Border; shadow?: Shadow
}

type TextElement = ElementBase & {
  type: 'text'; width: number            // wrap width; height is computed from content
  content: string                        // may hold {{name}} interpolation tokens
  fontAssetId: string                    // one Font Asset per element; no rich spans
  fontSize: number                       // px
  lineHeight: number                     // unitless multiplier of fontSize
  letterSpacing: number                  // px
  align: 'left' | 'center' | 'right'
  anchor: 'top' | 'middle' | 'bottom'    // vertical growth anchor
  color: Color | VarRef
  shadow?: Shadow
}

type GroupElement = ElementBase & {
  type: 'group'; children: Element[]     // child coords relative to group origin; groups nest
}                                        // no own width/height; bounds derive from children

type Element = RectElement | EllipseElement | VectorElement
             | ImageElement | TextElement | GroupElement

type VariableDecl = {
  name: string                           // unique; referenced by VarRef and {{name}}
  type: 'text' | 'image' | 'color' | 'number' | 'boolean'
  default?: string | number | boolean    // typed per `type`; absent = callers must supply
  constraints?: { maxLength?: number; minLength?: number }   // text only in v1
}
```

Schema notes that bind the implementer:

- **Fonts**: `fontAssetId` is the identity; family name is picker metadata on the Font Asset, not in the document. Bold/italic are separate Font Assets — no synthetic styling.
- **Color Variables** bind any solid color site (`fill` when solid, `border.color`, text `color`, canvas `background` when solid). They never bind gradients.
- **Group semantics**: group opacity composites the group as one unit (SVG `<g opacity>`); rotation is about the bbox center of its children in group-local coordinates.
- **Rect with per-corner radii** compiles to a `<path>` (SVG `<rect rx>` is uniform-only); the uniform number shorthand stays a `<rect>`.
- **Vector import**: the SVG importer flattens an imported file into a group of vector elements, one per path, each with a single fill. A multi-fill vector element does not exist.
- **Text wrapping**: greedy break at whitespace using opentype.js advance widths (kerning on, letterSpacing added per glyph gap); a single word wider than `width` breaks mid-word at character granularity. Height grows from `anchor`; growth past the canvas edge is cut at the canvas edge (accepted, previewed identically — node k77nv9).
- **Interpolation**: `{{name}}` substitutes before layout. A token naming no declared Variable is a validation error. No escape syntax for a literal `{{` in v1. A number Variable interpolates as ECMAScript `String(number)` — deterministic, both sides are JS; formatting/localization stays on the Frontier.
- **Missing glyph**: renders the Font Asset's own `.notdef`, identically on both sides. Never a fallback face.
- **Migrations**: forward-only, applied at load; the compiler accepts only `schemaVersion: 1`. The migration harness lands with the first version bump, not now.

### Validation semantics (node k77nv9, normative here)

- Strict types, no coercion: color must match `#RRGGBB`/`#RRGGBBAA`; number must be a JSON number; boolean strict.
- Omitted Variable → its default; omitted with no default → validation error. Explicit JSON `null` is always a type error.
- `""` is a legal text value (box collapses to zero-content height); forbid per Variable with `minLength` (`required` ≡ `minLength: 1`).
- An image value is an Image Asset id or an external http(s) URL; a fetch failure at render time fails that row with a named-Variable error. No placeholder ever appears in output.
- A missing Font Asset or Image Asset referenced by the document itself is a hard error naming the asset id and the referencing elements.
- Binding an element property to a Variable with no default copies the property's current authored value into the declaration as its default; text content does not seed (tokens live in the string; the default lives on the declaration).
- Editor preview of no-default Variables (worker never renders these — validation rejects first): text/number tokens render literally as `{{name}}`; image frame shows flat gray; color falls back to `#808080`; visibility previews as visible.

### Seam signatures

```ts
// Shared core package
function validateDocument(doc: unknown): ValidationError[]           // schema shape, refs, ids
function validate(template: DesignDocument, values: Record<string, unknown>): ValidationError[]
function resolve(template: DesignDocument, values: Record<string, unknown>): DesignDocument
function compile(doc: DesignDocument, assets: AssetResolver): string  // → SVG markup

type ValidationError = { variable?: string; elementId?: string; assetId?: string; message: string }

interface AssetResolver {
  fontBytes(fontAssetId: string): ArrayBuffer      // parsed by the compiler via opentype.js
  imageUrl(src: string): string                    // immutable app-storage URL (or passthrough external URL)
  imageSize(src: string): { width: number; height: number }  // for Variable-supplied images
}

// Render worker (Node, TypeScript)
function render(svg: string, options: RenderOptions): Promise<Uint8Array>
type RenderOptions =
  | { format: 'png'; scale: 1 | 2 | 3 }            // deviceScaleFactor; canvas alpha preserved
  | { format: 'jpeg'; quality?: number }           // default 90; composited over white
  | { format: 'pdf' }                              // printToPDF; page sized 1 canvas px = 1/96 in; vector text
```

## Dependencies

- **opentype.js** — the compiler's only font parser; owns every text metric. Its capabilities define the font contract (no WOFF2, no variable fonts — node oxcf2v).
- **playwright** (pinned version, paired browser build) — drives the pinned Chromium; the only browser automation dependency.
- **zod** — schema validation in the shared core package; one validator serving editor, worker, and (via API pass-through) FastAPI.
- **pixelmatch** + **pngjs** — the golden-image diff harness (ud46e4; prototype-proven).

No other dependency may be added by an implementation session without amending this section.

## Testing Decisions

The three agreed seams, outside-in:

1. **`compile` (unit + SVG snapshot tests, shared package).** External behavior only: document in, SVG string out. Worked examples:
   - Wrap: content `LIMITED OFFER`, the bundled bold font at `fontSize: 30`, `width: 290` → exactly 1 line; the same content at `width: 120` → 2 lines broken at the space.
   - Anchor: a 3-line text with `anchor: 'middle'` at `y: 400`, line height 36 → first baseline above 400, block vertically centered on 400.
   - Interpolation: `content: "Price: {{price}}"`, number value `4.99` → tspan text `Price: 4.99`.
   - Fit Mode: a 800×600 Variable image into a 400×400 frame with `cover` → drawn 533.33×400, centered, x-overflow clipped; with `contain` → 400×300, letterboxed inside the frame.
   - Per-corner radius `{topLeft: 20, others 0}` → emits `<path>`, uniform `20` → emits `<rect rx="20">`.
2. **`validate` (unit tests, shared package).** Every k77nv9 rule as a table: missing-with-default → resolves; missing-without-default → error naming the Variable; `null` → type error; `""` with `minLength: 1` → error; `"true"` for boolean → type error; `{{typo}}` unknown token → error; bad color format → error.
3. **`render` (golden-image tests, pinned worker image only).** Baselines are invalid unless baked in the pinned container (ud46e4). Comparator: pixelmatch `threshold: 0.1`; `maxDiffPixelRatio: 0` for worker-output goldens; `0.006` only for the named cross-flavor parity fixture. Fixture suite (small, named, Git-tracked lossless PNGs): the prototype composite (gradient, shadow, alpha, ellipse clip, crop, rotation, group opacity, vector, wrapped text); one fixture per bundled font family covering its weights and `.notdef`; anchors × alignments; radial/solid fills + borders + per-corner radii; nested z-order and visibility; `cover`/`contain`/`stretch` with transparent and raster assets; non-square and 2× canvases; a Template exercising defaults, the wrap boundary, and each bindable property kind. Baselines re-bake only on a deliberate environment-tuple change, reviewed and committed with old/new tuples; never auto-rebake on failure.

Missing values, missing assets, and validation failures are functional tests at seams 1–2, not goldens. Prior art: the diff harness on branch `prototype/render-fidelity`.

## Out of Scope

- The generation API, batch input format, and job lifecycle (open roadmap node jgo8tv).
- Upload endpoints and upload UI for fonts and images; this spec defines only the content-addressed read contract.
- All editor UX (canvas interactions, tools, undo/redo — Frontier).
- Auto-fit text, focal-point/smart crop, rich text spans, multi-page documents, SVG export, gradients on text or borders, inner shadows, background blur, blend modes (nodes ylg1wr, k77nv9).
- WOFF2 and variable-font uploads; glyph fallback chains; emoji coverage (node oxcf2v).
- Inside/outside stroke alignment (v1 strokes are centered).
- An escape syntax for literal `{{` in text content.
- Number formatting and localization of interpolated values.
- Migration tooling (arrives with the first schemaVersion bump).
- Bindable geometry, fonts, or opacity (v1 binds text content, image source, solid colors, numbers via interpolation, and visibility only).

## Further Notes

- All Node code is TypeScript — a standing project preference, not just for this spec.
- The pinned environment tuple that binds golden baselines: worker image digest, Playwright package + browser revision, headless flavor (full Chromium new headless), font bytes + fontconfig config, viewport/DPR/locale/timezone, compiler + schema version (ud46e4).
- Throughput baseline to preserve: ~166 ms/render at 8 concurrent pages in one browser instance; ≈2.8 min per 1,000 assets on one host (node gqr8bf). A page pool of 8 in one browser was stable.
- Bundled fonts (9 families, all SIL OFL, ~19 files, vendored in the repo): Inter, Montserrat, Lora, Playfair Display, Oswald, Bebas Neue, Pacifico, Dancing Script, JetBrains Mono (node oxcf2v). Uploaded fonts: uploader is responsible for rights; a docs note, no enforcement.
- The editor renders the compiled SVG inline as its preview; editor-authored state lives only in the Design Document. Anything the editor can show that the compiler cannot express is a bug in the editor, not a feature.
