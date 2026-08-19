---
id: mg5asi
title: DocumentView does not name the Workspace it belongs to
state: todo
priority: medium
parent: ek7pq1
created: 2026-08-19T11:28:20Z
updated: 2026-08-19T11:28:20Z
---

## What to build

`GET /api/v1/documents/{id}` answers with the document, its name, kind, revision and times — and nothing that says which Workspace it is in. The editor is reached at the document's own url, so a page that has only a document id cannot name its Workspace, and everything that is scoped by Workspace has to guess.

hg52gb met this first: the editor's top bar offers the rename only to an Editor or an Owner, and the Role it reads is the one in the Workspace the shell's switcher is on — right for every document opened from that list, wrong for a document deep-linked from another Workspace. There the api still refuses the save and the refusal is shown, so nothing is lost but the chance to not offer it.

The slices after it need the answer for more than a Role: the Assets panel (qbbli8), the font picker, and image drop (h66j4l) all list and upload against `/api/v1/workspaces/{workspaceId}/...`, for the Workspace of the document that is open.

## Acceptance criteria

- [ ] `DocumentView` carries the id of the Workspace the document belongs to; `DocumentSummary` is unchanged, since a list is already read through one Workspace.
- [ ] The editor decides what it offers from the Role in that Workspace, rather than from the Workspace the shell is switched to.
- [ ] `openapi.json` and the generated client are regenerated and committed.
