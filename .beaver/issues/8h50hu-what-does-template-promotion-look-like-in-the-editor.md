---
id: 8h50hu
title: What does template promotion look like in the editor?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - ep90f3
parent: v1xa7j
created: 2026-08-12T02:58:34Z
updated: 2026-08-12T02:58:34Z
---

Interview the user (grill-me skill, limited to this question) to settle the UI that turns a design into a Template.

The roadmap goal requires that "any design can be promoted to a template with variable slots (text, images, colors, prices)". The semantics are fully settled; the interface is not. A Template is a Design Document with `variables` declared. A `VarRef` (`{ $var: name }`) binds a property; `{{name}}` tokens interpolate inside text content. v1 binds text content, image source, solid colors, numbers via interpolation, and visibility — and nothing else. Node k77nv9 already fixed one interaction rule that this node must build an interface around: "Binding an element property to a Variable with no default copies the property's current authored value into the declaration as its default; text content does not seed."

Editor preview of no-default Variables is also already specified and must be shown faithfully: text and number tokens render literally as `{{name}}`, an image frame shows flat gray, a color falls back to `#808080`, and visibility previews as visible.

Settle: the gesture that binds a property to a Variable and the affordance that shows a property is bound; how a Variable is named, retyped, renamed, or deleted, and what a rename does to existing `{{name}}` tokens; how `{{name}}` tokens are authored inside a text box (typed literally, or inserted by a picker) and how an unknown token surfaces — the compiler treats it as a validation error, so the editor should not let one ship silently; where the Variable list lives and how defaults and constraints (`maxLength`, `minLength`) are edited; whether the editor previews a Template with sample values and where those come from; how a Template is created from a design and whether the two stay linked; and how one-off generation from the UI (the synchronous `POST /templates/{id}/render` in issue 0egsmf) is reached from the editor.

Input: node 53lwlc (bindable property kinds), node k77nv9 (variable semantics, seeding, and no-default preview), the core spec 1qoccb, the generation platform spec 0egsmf, and the interaction and inspector model from node ep90f3.
