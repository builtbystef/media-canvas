---
id: 0y2iw3
title: Variable binding and Unknown Tokens
state: done
assignee: agent
priority: high
depends_on:
    - 7el0o1
    - aij7vj
    - d2v61j
parent: ek7pq1
created: 2026-08-15T07:12:55Z
updated: 2026-08-26T10:15:25Z
---

## What to build

Binding: the act that turns an authored property into a slot generation fills. Every bindable field in the inspector grows a small control that points it at a Variable of the matching type, or makes one on the spot seeded with the value that was already there. Text and numbers bind differently — as tokens typed into the content — so the editor watches for tokens naming nothing and says so, loudly but without ever blocking typing. The editor warns; generation is what refuses.

## Acceptance criteria

- [ ] The bindable fields are exactly the ones the schema permits: an image's source, each solid colour site, and visibility. A bound field renders as a distinct chip naming its Variable; clicking the chip switches Variable or unbinds.
- [ ] The bind menu offers only Variables of the matching type, plus creating one inline; a newly created Variable takes the property's current authored value as its default. Worked example: binding a fill of `#0055FF` to a new Variable gives that Variable the default `#0055FF`.
- [ ] Unbinding writes the Variable's current default back as the property's authored value, so the element keeps looking the way it looked.
- [ ] Typing a double brace in a template's text pops an autocomplete of the declared text and number Variables; free typing stays allowed and nothing is auto-inserted.
- [ ] A token naming no declared Variable renders literally, badges its text element on the canvas and in the layer list, and raises a persistent warning in the Variables panel offering two one-click fixes: create that Variable, or rename the token to an existing one. Worked example: with only `price` declared, the text `Now {{prce}}` badges the element and offers both fixes.
- [ ] Neither an unknown token nor any other warning blocks typing or autosave.
- [ ] The preview shows each Variable's default; a Variable with no default previews as the fixed neutral the value rules define — a token stays literal, an image frame is flat grey, a colour is mid-grey, and visibility previews as visible.
- [ ] Creating, binding, unbinding and fixing a token are each one undo entry.

## Notes

**agent** — 2026-08-26T05:36:09Z

Seams for this AFK session (spec Testing Decisions, seam 1): (1) pure Variable document operations — bind, unbind, bind-and-create (seeded with the authored value), unknown-token detection, and the two token fixes; (2) token query while typing {{ — which names to offer, nothing auto-inserted; (3) previewDocument — resolve in preview mode so the compiled SVG shows defaults and the value-rule neutrals, while preserving element identity for ADR-0006; (4) the editor store — creating, binding, unbinding, and fixing a token are each one Undo Entry. UI (chips, bind menu, canvas/layer badges, Variables-panel warning, autocomplete list) sits on those.

**agent** — 2026-08-26T10:15:23Z

Built binding, Unknown Tokens, and defaults-as-preview at the four seams recorded at the start of this session.

Pure operations (variable-operations): bind / unbind / bind-and-create (seeded with the authored value) for image source, visibility, and every solid colour site; matching-type menu; unknown-token detection; create-from-token (text, no default — k77nv9: text content does not seed) and rename-token; {{ query + suggestions (text and number only) with insert only on pick. Picking mid-token replaces the rest of that token, including a later }}.

previewDocument resolves in preview mode so the compiled SVG shows defaults and the value-rule neutrals (literal token, grey image frame, #808080, visible), and restores object identity for ADR-0006. Image Variable defaults are fetched with the other preview assets.

Store: creating, binding, unbinding, and each token fix go through commitInspectorEdit, so each is one Undo Entry. Autosave still schedules on a document that holds an Unknown Token. openStoredDocument now opens those documents — validateDocument still reports them, generation still refuses; the editor warns.

UI sits on those: inspector chips (unbound = variable icon, bound = purple name chip that switches or unbinds), canvas and layer-list badges, Variables-panel warning with Create Variable / Rename to…, and the {{ autocomplete while editing text.

No new dependency. Spec has no review gate on this slice.
