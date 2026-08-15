---
id: qqzqhz
title: 'Documents: the table, the endpoints, and promotion'
state: todo
priority: high
depends_on:
    - ilgj60
    - sazdn4
parent: ek7pq1
created: 2026-08-15T07:12:07Z
updated: 2026-08-15T07:12:07Z
---

## What to build

A design has somewhere to live. One table holds every document, design and template alike, so opening one is a single code path; the api stores and serves the document as opaque JSON and never looks inside it. Saving states the revision it loaded, so a second tab cannot silently overwrite the first. Promoting a design copies it into a new template, which is what keeps a template stable while the design it came from keeps changing.

## Acceptance criteria

- [ ] One table holds both kinds, carrying the document itself, its name, its kind, its revision, its schema version denormalized for operational queries, and the lineage of the document it was promoted from.
- [ ] A document is created, listed, fetched, saved, and deleted through the Workspace-scoped surface; the list filters by kind, omits the document body, and orders by last update, newest first, unpaginated.
- [ ] A save states the revision it loaded. A matching revision saves and returns exactly one more; a stale one is refused and changes nothing. Worked example: loading revision 4, saving twice from two callers → the first returns 5, the second is refused with 409 and the stored document still reads 5.
- [ ] Promoting a design creates a new row of kind template with the document copied, the lineage pointing back, its own revision starting at one, and the name copied verbatim. Worked example: promoting the same design twice yields two independent templates, and editing either changes neither the other nor the original.
- [ ] Promoting a template is refused.
- [ ] Deleting a document that a template was promoted from leaves that template intact, with its lineage cleared rather than dangling.
- [ ] The api never interprets the document: no route reads an element, a Variable, or a token out of it.
- [ ] Access is the record's Workspace against the caller's Membership: creating, saving, promoting, renaming and deleting are Editor-level; reading is open to any member; a caller outside the Workspace is refused in a way that does not reveal whether the document exists.
