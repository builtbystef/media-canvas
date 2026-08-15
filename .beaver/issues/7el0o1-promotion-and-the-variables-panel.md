---
id: 7el0o1
title: Promotion and the Variables panel
state: todo
priority: high
depends_on:
    - qqzqhz
    - 3488y6
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-15T07:12:49Z
---

## What to build

A design becomes a Template, and a Template gets its Variables. Promotion is the door: the Variables panel and every binding control exist only for templates, so there is no confusing half-state where a design has sprouted Variables. Promotion copies, so the design and the template evolve apart from that moment. The panel is where Variables are born, renamed, given defaults, and deleted — and where a rename rewrites every reference and every token in one undoable step.

## Acceptance criteria

- [ ] A promote action in the editor's top bar for an open design, and on a design's row in the list, creates the template copy and navigates straight into it. There is no naming dialog; the name is copied and renamed in place afterwards.
- [ ] A template shows a small link back to the document it was promoted from, and nothing else follows from that lineage.
- [ ] The Variables panel appears only for templates, as a sibling of the other left-hand panels, with one row per Variable: name, type, a default edited with that type's own control, the length bounds for text, and a usage count so dead Variables are visible.
- [ ] Variable names must start with a letter and continue with letters, digits or underscores, case-sensitively, enforced at creation and at rename. Worked example: the name `2price` is refused, `price_2` is accepted.
- [ ] Renaming rewrites every reference and every double-brace token in text content, in one undo entry. Worked example: renaming `old` to `new` turns a bound fill's reference and the text `Price: {{old}}` into the new name together, and one undo restores both.
- [ ] A rename colliding with an existing Variable is refused inline.
- [ ] There is no retyping a Variable: the type is fixed at creation, and changing it means deleting and recreating.
- [ ] Deleting a Variable asks first, listing what it affects, then unbinds every bound property by writing the Variable's current default back as the authored value — and never edits text content, so its tokens stay literally where they were.
