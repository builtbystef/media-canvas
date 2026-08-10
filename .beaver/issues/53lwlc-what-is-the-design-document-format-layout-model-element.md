---
id: 53lwlc
title: 'What is the design document format: layout model, element types, variable bindings, versioning?'
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - ylg1wr
    - 7mza2q
parent: v1xa7j
created: 2026-08-08T07:08:45Z
updated: 2026-08-08T08:52:06Z
---

Interview the user (grill-me skill, limited to this question) to settle the core data model of the product. This is the hardest-to-reverse decision; everything else consumes it.

Settle: the layout model (absolute positioning vs auto-layout/flex-like, canvas size and units); the element types (text, image, shape, group — the closed set for v1); how a design becomes a template — the variable binding model (which properties are bindable: text content, image source, colors, numbers/prices; how a slot is declared and typed); and the versioning strategy (a schema version field, what a breaking change is, migration expectations).

Inputs: the MVP cut (node ylg1wr) bounds the element types; the rendering research (node 7mza2q) bounds what a renderer can honor. Record the format decision as an ADR when settled.

## Notes

**claude** — 2026-08-08T08:52:01Z

ANSWER (settled by interview, user confirmed 2026-08-08). ADR: docs/adr/0001-json-design-document-format.md. Glossary gained: Design Document, Element, Template, Variable.

DOCUMENT SHAPE: our own JSON schema (not literal SVG), compiled deterministically to the render engine's markup (SVG or DOM) at render time. The compiler is the single place render fidelity is defined. Reason: SVG-as-storage would smuggle renderer concerns into the data model and push groups/crop/Variables/metadata into data-* attributes; JSON validates (JSON Schema / Pydantic), diffs, and migrates directly; the compile step keeps both engine candidates (node gqr8bf) open.

LAYOUT MODEL: absolute positioning only for v1. Each element: x, y, width, height, rotation. No auto-layout, no resize anchoring (Frontier, later version). Units: px, floats allowed; origin top-left, y down; canvas size = export size at scale 1 (1080x1080 design -> 1080px PNG at 1x, 2160 at 2x); rotation in degrees, clockwise, about the element's center. Colors: hex strings #RRGGBB / #RRGGBBAA. Fonts referenced by family name + weight + style, resolved against a project-managed pinned font set, never system fonts (node oxcf2v owns the font pipeline).

ELEMENT TYPES (closed set, 6): text, image, rect, ellipse, vector, group. Preset shapes (star, arrow, triangle, line) are shipped vector elements, not their own types. Fills/borders/shadow/opacity/crop are properties on these types, not types.
- Text: fixed width (content wraps at it), auto height growing from a stored vertical anchor (top/middle/bottom). Long bound text grows the box; it never clips silently. Auto-fit (shrink font to fit) deferred to Frontier.
- Image: frame/content model — the element rect is the frame; an inner content transform (offset + scale of the bitmap within the frame) is the crop; outside the frame is clipped. Clip-to-shape is one extra property: clip: none | ellipse | {vector path}.
- Group: children in coordinates relative to the group origin; groups nest; a group has position + rotation but no own width/height (bounds derive from children); group opacity composites the group as one unit (SVG <g opacity> semantics), not per-child multiplication.

VARIABLE BINDING MODEL: a Template is a Design Document with Variables declared — promotion COPIES a design into a template, so later edits to the original do not change what batch jobs produce. Variables are declared top-level (name, type, default value, optional constraints e.g. maxLength on text) so the API/CSV layer can enumerate them without walking the tree; element properties reference a Variable by name, and one Variable may bind many properties (e.g. brandColor). Variable types (closed for v1): text, image, color, number, boolean. Bindable targets: text content (via {{name}} interpolation inside the string — whole-content binding is the degenerate case "{{name}}"; substitution happens before layout), image source, any solid color, number (rendered into text via interpolation; formatting stays on the Frontier), element visibility (boolean's only v1 target). NOT bindable in v1: geometry, fonts, opacity (Frontier).

VERSIONING: required top-level integer schemaVersion, starting at 1 (not semver — one writer, no compatibility ranges to signal). Bump on any change an older reader would misrender or reject. Migrations are forward-only and applied at load (old doc -> migrate in memory -> saves at current version); the renderer accepts only the current version; no down-migrations.

CONSEQUENCE FOR DEPENDENT NODES: gqr8bf prototypes JSON->markup->pixels with this format; k77nv9 inherits the overflow decision (wrap + auto height + maxLength rejection) and still owes aspect-mismatch and missing-value behavior; 6lxoec specs this format in full detail (property lists, JSON field names).
