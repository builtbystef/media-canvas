---
id: d2v61j
title: Variable validation and value resolution
state: todo
priority: high
depends_on:
    - 8xstzw
parent: 1qoccb
created: 2026-08-15T05:48:22Z
updated: 2026-08-15T05:48:22Z
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
