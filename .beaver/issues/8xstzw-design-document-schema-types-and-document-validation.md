---
id: 8xstzw
title: Design Document schema types and document validation
state: done
assignee: claude
priority: high
parent: 1qoccb
created: 2026-08-15T05:48:05Z
updated: 2026-08-18T07:11:09Z
---

## What to build

One authority decides whether a Design Document is a valid v1 document, so the editor, the render worker, and the API can never disagree about it. A document that misdeclares its schema version, repeats an element id, points a Variable reference at a Variable nobody declared, or carries a malformed color is rejected with errors that name the offending element — not with a stack trace halfway through a render.

## Acceptance criteria

- [ ] The v1 type set is exported from the shared core package: the canvas, Variable declarations, and the six element types (rect, ellipse, vector, image, text, group) with every property the spec names, including fills (solid, linear gradient, radial gradient), borders, shadows, and corner radii.
- [ ] `validateDocument(doc)` accepts unknown input and returns an empty list for a valid document, or a list of errors. Each error carries a message and the id of the element it is about; errors about a Variable name that Variable.
- [ ] `schemaVersion` must be the integer 1. Worked example: a document identical to a valid one but with `schemaVersion: 2` produces exactly one error, naming the version — the compiler accepts no other version, and migrations are out of scope until the first bump.
- [ ] Element ids are unique across the whole tree, groups included. Worked example: a group whose child has id `a`, next to a top-level rect with id `a`, produces one duplicate-id error naming `a`.
- [ ] Every `{$var: name}` reference and every `{{name}}` token inside text content names a declared Variable. Worked example: with only `price` declared, a text element whose content is `Now {{prce}}` produces one error naming `prce` and that element.
- [ ] Colors are `#RRGGBB` or `#RRGGBBAA`. Worked example: `#FFFFFF` and `#ffffff80` are valid; `#fff` and `red` each produce an error naming the element.
- [ ] Numeric ranges are enforced: element opacity and shadow opacity in 0..1, gradient stop offsets in 0..1, widths and heights non-negative. Worked example: `opacity: 1.5` on an element produces one error naming it.
- [ ] A Variable reference appears only where v1 permits one — text content tokens, image source, solid color sites (element fill, border color, text color, canvas background), and visibility. Worked example: `fill: {$var: 'brand'}` on a rect validates; the same reference used as a gradient stop color, as `width`, or as `fontAssetId` produces an error.
- [ ] A document with no `variables` is valid (it is a design, not a Template); a Template's Variable names are unique and each declared `default` matches its declared type.

## Notes

**claude** — 2026-08-18T07:11:09Z

Built in packages/core: the v1 Design Document type set (src/document.ts) and validateDocument (src/validation.ts), exported from @media-canvas/core. Tests at the agreed seam — document in, errors out, no internals touched — in src/validation.test.ts (14 tests, one per acceptance criterion plus a full-coverage valid document).

Decisions made while building:

- zod is the validator, as the spec's Dependencies section names (the only new dependency; nothing else was added). Its shape errors are mapped to the spec's ValidationError, with the element id recovered by walking the input along the failing property's path and taking the innermost value that carries an `id` — so every error names its element without validation having to be written twice.
- Multi-shape properties (fill, background, visible, src, cornerRadius, clip, colors) dispatch on the value's own shape instead of using a zod union, so the reported error is the one from the branch the author meant ("elements[0].fill.stops[0].offset: must be between 0 and 1"), not a blanket "invalid union".
- Shape errors are returned alone; the checks that span the document (duplicate ids, duplicate Variable names, Variable references) run only once the shape holds. That keeps one mistake at one error, which is what the worked examples require.
- A Variable reference at a site v1 does not bind fails its property's own type check; the error message is rewritten to say so ("a Variable reference is not permitted here — v1 binds ... text content tokens, image source, solid colors, and visibility only") rather than "must be a number".
- Unknown-name reporting is deduplicated per (element, name), so one element repeating {{typo}} yields one error.
- An interpolation token's name is the exact text between the braces, with no trimming, and there is no escape syntax (spec). `interpolationTokens` is exported so that resolve (d2v61j) substitutes on exactly the same rule instead of re-deriving it.
- Image `content` is optional in the type. The spec's schema block lists it required, but the seam decision on this spec (2026-08-15) has `resolve` drop the authored crop from a Variable-sourced image, and `resolve` returns a DesignDocument — so the resolved form must validate too.
- Non-negativity is enforced where the criterion names it: canvas and element width/height, vector viewBox, image natural size, and border width. Rotation, offsets, and letterSpacing stay unconstrained; every number must be finite (zod rejects NaN and Infinity).
- Unknown properties are ignored rather than rejected — v1 documents are not sealed. Nothing in the criteria asks for rejection, and stripping keeps a forward-migrated document loadable.

Two repo-level consequences worth knowing:

- tsconfig/base.json now sets allowImportingTsExtensions, and core's relative imports carry `.ts`. Workspace packages export TypeScript source, and the worker runs it under Node type-stripping, where an extensionless relative import does not resolve. Every project here sets noEmit, which is what the option needs. Verified: `node src/index.ts` in apps/worker still runs.
- The scaffold's placeholder test (packages/core/src/index.test.ts, asserting the schema-version constant against itself) is deleted, now that a real suite covers the package.

pnpm run ci is green: format, lint, typecheck, 14 TS tests + 9 pytest, build.
