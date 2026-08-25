---
id: 7el0o1
title: Promotion and the Variables panel
state: done
assignee: agent
priority: high
depends_on:
    - qqzqhz
    - 3488y6
    - gw6v31
parent: ek7pq1
created: 2026-08-15T07:12:49Z
updated: 2026-08-25T20:14:40Z
---

## What to build

A design becomes a Template, and a Template gets its Variables. Promotion is the door: the Variables panel and every binding control exist only for templates, so there is no confusing half-state where a design has sprouted Variables. Promotion copies, so the design and the template evolve apart from that moment. The panel is where Variables are born, renamed, given defaults, and deleted — and where a rename rewrites every reference and every token in one undoable step.

## Acceptance criteria

- [ ] A promote action in the editor's top bar for an open design, and on a design's row in the list, creates the template copy and navigates straight into it. There is no naming dialog; the name is copied and renamed in place afterwards. The list-row control itself is built by the shell slice (hg52gb); this issue owns the editor's top-bar action and the shared promote flow both controls land in.
- [ ] A template shows a small link back to the document it was promoted from, and nothing else follows from that lineage.
- [ ] The Variables panel appears only for templates, as a sibling of the other left-hand panels, with one row per Variable: name, type, a default edited with that type's own control, the length bounds for text, and a usage count so dead Variables are visible.
- [ ] Variable names must start with a letter and continue with letters, digits or underscores, case-sensitively, enforced at creation and at rename. Worked example: the name `2price` is refused, `price_2` is accepted.
- [ ] Renaming rewrites every reference and every double-brace token in text content, in one undo entry. Worked example: renaming `old` to `new` turns a bound fill's reference and the text `Price: {{old}}` into the new name together, and one undo restores both.
- [ ] A rename colliding with an existing Variable is refused inline.
- [ ] There is no retyping a Variable: the type is fixed at creation, and changing it means deleting and recreating.
- [ ] Deleting a Variable asks first, listing what it affects, then unbinds every bound property by writing the Variable's current default back as the authored value — and never edits text content, so its tokens stay literally where they were.

## Notes

**agent** — 2026-08-25T20:01:13Z

Seams for this AFK session (spec Testing Decisions, seam 1): (1) pure Variable document operations — create, rename, delete, defaults, constraints, name grammar, usage; (2) the editor store — a rename is one Undo Entry; (3) the shared promote flow both the list row and the editor top bar call, which returns the new template so the caller can navigate into it. UI wiring (Variables panel, Promote button, promoted-from link) sits on those three.

**agent** — 2026-08-25T20:14:36Z

Built. Promotion is the door into a Template, and the Variables panel is where those Variables are born, renamed, given defaults, and deleted. pnpm check is green. The TypeScript suite is green (314). The FastAPI suite is green against the compose sockets.

What landed:
- Shared promote flow (`promoteToTemplate`) — both the list-row Promote and the editor's "Promote to Template" call it and navigate into the new copy. No naming dialog.
- A "promoted from X" link on a template with lineage; deleting the source still clears `promotedFromId` (qqzqhz), so the link simply is not shown.
- Variables panel, template-only, sibling of Layers. One row: name, fixed type, typed default control, min/max for text, usage count, delete.
- Pure operations: create / rename / delete / default / constraints, name grammar `^[A-Za-z][A-Za-z0-9_]*$`. Rename rewrites every `$var` and every `{{name}}` token in one Undo Entry. Delete writes the current default back onto bound properties and never edits text content.

Decisions:
- Image default is an Image Asset id field. The image picker lives on the Assets panel (qbbli8); this panel does not grow one.
- An image Variable with no default cannot be written back as an authored `src` (there is no valid empty id). Binding (0y2iw3) seeds the default, so a bound image Variable always has one. Color/boolean fall back to the preview neutrals (`#808080`, visible).
- Promote copies the last saved document, as the api already does. Unsaved edits stay on the design and flush on leave.

Test seams: apps/web/lib/variable-operations.test.ts, promote.test.ts, editor-store.test.ts (the rename Undo Entry).
