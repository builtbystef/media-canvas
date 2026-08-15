---
id: 0y2iw3
title: Variable binding and Unknown Tokens
state: todo
priority: high
depends_on:
    - 7el0o1
    - aij7vj
    - d2v61j
parent: ek7pq1
created: 2026-08-15T07:12:55Z
updated: 2026-08-15T07:12:55Z
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
