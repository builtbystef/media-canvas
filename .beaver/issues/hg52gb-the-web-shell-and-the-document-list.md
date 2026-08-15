---
id: hg52gb
title: The web shell and the document list
state: todo
priority: high
depends_on:
    - qqzqhz
    - jmpc8g
parent: ek7pq1
created: 2026-08-15T07:12:12Z
updated: 2026-08-15T07:12:12Z
---

## What to build

The product gets a front door. A signed-in user lands on the documents of the Workspace they are in, switches Workspace from the shell, and creates a design from a Canvas Preset or their own dimensions — which is the only way a document is born. Designs and templates live in one list with one row shape, because opening either is one code path.

## Acceptance criteria

- [ ] The shell carries a Workspace switcher; switching changes which Workspace's documents the list shows, and the choice survives a reload.
- [ ] Light and dark follow the system preference with no in-app toggle, and the canvas area is unaffected by either, since a document renders its own background.
- [ ] The list shows one row per document with its name, kind, and last update, newest first, with tabs filtering to all, designs, or templates. Worked example: the templates tab shows no designs.
- [ ] A row opens its document, promotes it when it is a design, and deletes it behind a confirm.
- [ ] The creation dialog offers the named canvas presets or custom dimensions, and creates an untitled design with a white background and no elements, then opens it. Worked example: choosing the square social preset creates a 1080 by 1080 document.
- [ ] There is no search, no folders, and no duplication in the list.
- [ ] A member who is a Viewer sees the list and can open documents, but the create, promote, and delete actions are not offered to them.
