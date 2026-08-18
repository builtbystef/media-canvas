---
id: d2v61j
title: Variable validation and value resolution
state: done
assignee: claude
priority: high
depends_on:
    - 8xstzw
parent: 1qoccb
created: 2026-08-15T05:48:22Z
updated: 2026-08-18T09:24:59Z
---

## What to build

A row of values meeting a Template either fails before anything is drawn, with an error naming the Variable at fault, or produces a plain Design Document with no Variables left in it. A 1,000-row batch never ships an asset with a placeholder, a clipped value, or a literal `{{name}}` in it, because a row that would do so is rejected first. The editor gets the one exception it needs: a preview of a Template whose Variables have no values yet.

## Acceptance criteria

- [ ] `validate(template, values)` returns an empty list only when `resolve` will succeed; otherwise it returns one error per problem, each naming its Variable. It also reports everything document validation would report about the Template itself.
- [ ] An omitted value takes the Variable's declared default. Omitted with no default is an error naming the Variable. Worked example: a Template declaring `headline` (default `"Sale"`) and `price` (no default), given `{}` → exactly one error, naming `price`.
- [ ] Explicit `null` is a type error for every Variable type — it is never treated as "omitted".
- [ ] Types are strict, with no coercion. Worked examples: `"true"` for a boolean → error; `"5"` for a number → error; `5` for a text Variable → error; `"blue"` or `"#fff"` for a color → error, while `"#0055FFAA"` passes.
- [ ] `""` is a legal text value; with `minLength: 1` on that Variable it is an error; a value longer than `maxLength` is an error. Worked example: `minLength: 1`, value `""` → one error naming the Variable.
- [ ] An image value is either an Image Asset id or an `http(s)` URL; anything else is an error naming the Variable.
- [ ] `resolve(template, values)` returns a Design Document with no Variable declarations and no Variable references left: every bound property carries its resolved value, and `{{name}}` tokens are substituted before any layout happens. Worked examples: content `"Price: {{price}}"` with the number `4.99` → `"Price: 4.99"`; with `4.90` → `"Price: 4.9"`.
- [ ] An image element whose source came from a Variable loses its authored crop in the resolved document, so the compiler places that image by its Fit Mode; an image whose source was authored keeps its crop:

```
src: {$var: 'photo'}  →  src: '<asset id>', authored crop dropped   // compiler fits by fitMode
src: '<asset id>'     →  crop preserved                             // compiler uses the crop
```

- [ ] Resolving for editor preview — never for generation, which rejects these rows first — fills Variables that have neither a value nor a default: text and number tokens stay literally `{{name}}`, an image frame becomes flat gray, a color becomes `#808080`, and visibility previews as visible.

## Notes

**claude** — 2026-08-18T09:24:58Z

Built `validate(template, values)` and `resolve(template, values, mode)` in the shared core, as `packages/core/src/values.ts` with `packages/core/src/values.test.ts` (seam 2 of the spec's Testing Decisions: unit tests on the shared package).

Completed work
- `validate` runs `validateDocument` first and returns its errors alone when the Template itself is broken, so one mistake yields one error instead of a cascade; otherwise it checks the row: omitted takes the default, omitted with no default is an error, and every present value is type-checked strictly with no coercion (explicit `null` is a type error for every type, since it is a value and not an omission). Text values carry the v1 `minLength`/`maxLength` constraints; `""` is legal unless `minLength` forbids it. An image value is an Image Asset id or an `http(s)` URL.
- `resolve` returns a plain Design Document: the `variables` key is gone, every VarRef site (canvas background, fill, border colour, text colour, image source, visibility) carries its value, and `{{name}}` tokens are substituted before layout — a number as `String(number)`, so `4.90` renders `4.9`. An image whose `src` came from a VarRef loses its authored `content` crop; an authored `src` keeps it (the spec's 2026-08-15 seam decision).
- `resolve(template, values, "preview")` is the editor's mode: an unfilled text or number token stays literal, an unfilled colour site becomes `#808080`, an unfilled visibility previews as visible, and an unfilled image frame becomes a flat gray rect. In the default "generate" mode the same situations throw instead, naming the Variable — generation validates first, so reaching resolve unfilled is a pipeline mistake, never something to draw around.

Decisions a reviewer needs
- AC1 ("`validate` returns an empty list only when `resolve` will succeed") was not reachable without one addition to the document authority: nothing checked that a Variable's declared type suits the site that references it, so a Template binding a number Variable to a fill passed validation and then broke at resolve time. `validateDocument` now reports that (`referenceTypeErrors` in `validation.ts`), which also gives the editor the warning and keeps Template problems reported by the document authority, as gxwr7t expects. Solid-colour sites take a colour Variable, visibility a boolean, image source an image, and a `{{name}}` token a text or a number — exactly the v1 binding list.
- An unfilled image frame in a preview compiles as a gray `rect` carrying the frame's geometry, corner radius, border, and shadow. A Design Document has no way to say "no image here" with an image element, and inventing a sentinel `src` would push the placeholder into the AssetResolver contract. Known limitation: an image with `clip: "ellipse"` or a clip path still previews as a rectangle.
- `preview` rides as an optional third argument, so the spec's seam signature `resolve(template, values)` is unchanged for generation.
- No new dependency; the token pattern and the colour pattern are now exported from `validation.ts` so validation and resolution cannot drift over what a token or a colour is.

Checks: `pnpm check`, `pnpm test` (63 TS + 43 Python), and `pnpm build` all pass; no OpenAPI or client drift.
