---
id: 8h50hu
title: What does template promotion look like in the editor?
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - ep90f3
parent: v1xa7j
created: 2026-08-12T02:58:34Z
updated: 2026-08-14T05:54:38Z
---

Interview the user (grill-me skill, limited to this question) to settle the UI that turns a design into a Template.

The roadmap goal requires that "any design can be promoted to a template with variable slots (text, images, colors, prices)". The semantics are fully settled; the interface is not. A Template is a Design Document with `variables` declared. A `VarRef` (`{ $var: name }`) binds a property; `{{name}}` tokens interpolate inside text content. v1 binds text content, image source, solid colors, numbers via interpolation, and visibility — and nothing else. Node k77nv9 already fixed one interaction rule that this node must build an interface around: "Binding an element property to a Variable with no default copies the property's current authored value into the declaration as its default; text content does not seed."

Editor preview of no-default Variables is also already specified and must be shown faithfully: text and number tokens render literally as `{{name}}`, an image frame shows flat gray, a color falls back to `#808080`, and visibility previews as visible.

Settle: the gesture that binds a property to a Variable and the affordance that shows a property is bound; how a Variable is named, retyped, renamed, or deleted, and what a rename does to existing `{{name}}` tokens; how `{{name}}` tokens are authored inside a text box (typed literally, or inserted by a picker) and how an unknown token surfaces — the compiler treats it as a validation error, so the editor should not let one ship silently; where the Variable list lives and how defaults and constraints (`maxLength`, `minLength`) are edited; whether the editor previews a Template with sample values and where those come from; how a Template is created from a design and whether the two stay linked; and how one-off generation from the UI (the synchronous `POST /templates/{id}/render` in issue 0egsmf) is reached from the editor.

Input: node 53lwlc (bindable property kinds), node k77nv9 (variable semantics, seeding, and no-default preview), the core spec 1qoccb, the generation platform spec 0egsmf, and the interaction and inspector model from node ep90f3.

## Notes

**claude** — 2026-08-14T05:54:34Z

ANSWER (settled by interview, user confirmed 2026-08-14). Glossary gained: Unknown Token. No new ADR — everything here is editor UI over already-settled semantics, plus one reversible contract amendment recorded on spec 0egsmf.

TEMPLATE-ONLY AUTHORING: the Variables panel and every bind control appear only when the open document is kind='template'. A design has no Variable UI; promotion is the door. Reason: a design that has sprouted Variables but is not a Template is a confusing in-between state, and the schema already defines a Template as a Design Document with Variables declared.

PROMOTION: a "Promote to Template" button in the editor's top bar while a design is open, and the same action on a document's row in the list view. It calls POST /documents/{id}/promote (73rm0x) and navigates straight into the new template copy in the editor. No naming dialog — the name is copied verbatim; rename in place. Lineage (promoted_from_id) displays as a small "promoted from X" link, nothing more. Promoting the same design again just makes another independent copy.

BINDING: each bindable inspector field — image source, every solid-color site (fill when solid, border.color, text color, canvas background when solid), and visible — gets a small variable icon. Clicking it opens a menu of declared Variables OF THE MATCHING TYPE plus "New Variable…", which creates one inline; per k77nv9 the property's current authored value seeds the new Variable's default. A bound field renders as a distinct chip (Figma-purple style) showing the Variable name; clicking the chip switches Variables or unbinds. UNBIND writes the Variable's current default back as the authored value. Text and number Variables bind through {{name}} tokens in text content, never through chips.

VARIABLES PANEL: a left-side panel, sibling of Layers/Assets/Shapes, template-only. One row per Variable: name, type, default (edited with the type's own control — text field, color swatch, image picker, number field, checkbox), minLength/maxLength for text, and a usage count so dead Variables are visible. Create, rename, and delete live here.

NAME GRAMMAR: ^[A-Za-z][A-Za-z0-9_]*$, case-sensitive, enforced at creation and rename. One grammar keeps the {{token}} parser, CSV header columns, and JSON keys unambiguous with no escaping rules.

RENAME: rewrites every $var reference AND every {{name}} token in text content, in one Undo Entry. A collision with an existing name is rejected inline.

RETYPE: none in v1 — the type is fixed at creation; changing it is delete + recreate. A conversion matrix is edge rules for a rare operation.

DELETE: a confirm dialog lists what is affected ("bound to 3 properties, used in 2 text elements"). Deleting unbinds every bound property (default written back) and NEVER edits text content: {{name}} tokens stay literally, immediately becoming Unknown Tokens caught by the warning machinery below. Re-creating a same-named Variable revives the tokens — the same revival-by-identity rule assets took in 3ko2p7.

TOKEN AUTHORING: tokens are typed literally in text content (ep90f3). Typing {{ in a template's text box pops an autocomplete of declared text/number Variables; free typing stays allowed. An Unknown Token renders literally in the preview, badges the text element (canvas overlay + layer list), and raises a persistent warning in the Variables panel with one-click fixes: create the Variable from the token, or rename the token. The editor never blocks typing or autosave; generation is the hard gate (compiler validation error).

PREVIEW: the defaults ARE the preview, with k77nv9's fixed neutrals for no-default Variables. No sample-value mode in v1; the Generate dialog is where real values are seen, and its output is exactly the render.

GENERATE (ONE-OFF): a "Generate" button in the editor's top bar opens a dialog: one typed input per declared Variable, prefilled with defaults, constraints enforced inline; an output-format picker (PNG scale 1/2/3, JPEG quality, PDF); Generate calls the synchronous render endpoint and hands the file over as a download. Nothing persisted, per the contract.

DESIGNS EXPORT TOO (contract amendment to 0egsmf): the same Generate button and dialog appear for designs — the dialog is just the format picker. The synchronous render endpoint becomes POST /documents/{id}/render and accepts any document kind; a design renders with values {} and any supplied value is a 422. Batch endpoints stay template-only. Reason: without this, a plain design has no path to a file except promoting it into a pointless empty Template, and exported output is the point of the system.

BATCH UI: out of this node — one-off only here. The batch/CSV upload surface is its own question (new node).

REASON THROUGHOUT: every gesture is inspector-anchored (ep90f3's single-authority rule), every destructive edge fails loudly instead of silently rewriting content, and the editor warns while generation enforces — the same warn-here, reject-there split the project uses everywhere else.
