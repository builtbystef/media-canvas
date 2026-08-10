---
id: k77nv9
title: 'How do template variables behave at the edges: overflow, aspect mismatch, missing values?'
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - 53lwlc
parent: v1xa7j
created: 2026-08-08T07:08:59Z
updated: 2026-08-10T05:28:08Z
---

Interview the user (grill-me skill, limited to this question) to settle templating semantics — the behavior when injected content does not fit the design.

Settle: text that overflows its box (shrink-to-fit, truncate, ellipsis, reflow, error?); images whose aspect ratio differs from the slot (cover, contain, stretch, focal point?); missing or empty variable values (default value, skip render, hard error?); value validation (types, max lengths, color formats, price formatting); and whether a template declares per-variable rules or the format fixes one global behavior.

Input: the design format from node 53lwlc defines what a variable slot is. These semantics must be identical in the editor preview and the worker render.

## Notes

**claude** — 2026-08-10T05:28:04Z

ANSWER (settled by interview, user confirmed 2026-08-10). Glossary gained: Fit Mode. These semantics are identical in editor preview and worker render; the core-area spec (6lxoec) adopts them.

TEXT OVERFLOW (extends 53lwlc): bound text wraps at the box's fixed width; height grows from the stored vertical anchor; never clips silently at box level. Growth past the canvas boundary is cut at the canvas edge — accepted, not treated as silent clipping (preview shows exactly this; maxLength is the guard). Auto-fit stays on the Frontier.

IMAGE ASPECT MISMATCH: a Variable-supplied image ignores the authored crop (content transform) and is placed by the element's Fit Mode: cover (default — fill frame, center, crop excess), contain, or stretch. Fit Mode is a property of the image element, authored in the editor. Focal point / smart crop → Frontier.

MISSING VALUES: omitted Variable → its default; omitted with no default → validation error before any render. Explicit JSON null is always a type error (never means 'use default'). Binding seeds the default: binding an element property (image source, color) to a Variable that has no default copies the property's current authored value into the declaration; text does not seed (content string holds the {{name}} tokens; default lives on the declaration). A Variable without a default is therefore a deliberate 'callers must supply this'.

EMPTY VALUES: "" is a legal text value and renders as empty text (box collapses to zero-content height). Forbid per-variable with minLength; 'required' ≡ minLength: 1. With boolean-bound visibility this expresses 'this row has no badge'.

VALIDATION: strict types, no coercion — color must match #RRGGBB/#RRGGBBAA, number must be a JSON number, boolean strict (no "true" strings). v1 constraint set: maxLength + minLength on text ONLY; no number ranges, no regex (Frontier). Validation runs entirely BEFORE rendering: a row fails fast with a named-variable error, or renders completely — a render never half-fails on values. Image values are a URL or uploaded-asset reference; a fetch failure at render time fails that row with an error — no placeholder image ever appears in output.

EDITOR PREVIEW OF NO-DEFAULT VARIABLES (worker never renders these — validation rejects first): fixed per-type neutrals — text/number tokens render literally as {{name}}; image frame shows a flat gray placeholder; color falls back to 50% gray (#808080); visibility-bound boolean previews as visible.

WHERE RULES LIVE: Fit Mode on the image element; constraints on the Variable declaration; NO global on-error setting in v1. One template, one deterministic behavior.

REASON: every choice keeps generation deterministic and fail-fast — bad input is rejected by validation with a named variable, never patched over at render time, so 1,000-asset batches cannot silently ship placeholder or clipped output that preview never showed.
