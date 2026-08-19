---
id: hg52gb
title: The web shell and the document list
state: done
assignee: claude
priority: high
depends_on:
    - qqzqhz
    - jmpc8g
parent: ek7pq1
created: 2026-08-15T07:12:12Z
updated: 2026-08-19T11:29:28Z
---

## What to build

The product gets a front door. A signed-in user lands on the documents of the Workspace they are in, switches Workspace from the shell, and creates a design from a Canvas Preset or their own dimensions — which is the only way a document is born. Designs and templates live in one list with one row shape, because opening either is one code path.

## Acceptance criteria

- [ ] The shell carries a Workspace switcher; switching changes which Workspace's documents the list shows, and the choice survives a reload.
- [ ] Light and dark follow the system preference with no in-app toggle, and the canvas area is unaffected by either, since a document renders its own background.
- [ ] The list shows one row per document with its name, kind, and last update, newest first, with tabs filtering to all, designs, or templates. Worked example: the templates tab shows no designs.
- [ ] A row opens its document, promotes it when it is a design, and deletes it behind a confirm. The list-row promote action is owned here; the editor's own Promote button and everything after promotion belong to 7el0o1.
- [ ] The editor's top bar renames the document in place: the name is editable where it is displayed, commits on blur or Enter, and persists through the ordinary document save. This piece of editor chrome is owned here, with the rest of the shell.
- [ ] The creation dialog offers the named canvas presets or custom dimensions, and creates an untitled design with a white background and no elements, then opens it. Worked example: choosing the square social preset creates a 1080 by 1080 document.
- [ ] There is no search, no folders, and no duplication in the list.
- [ ] A member who is a Viewer sees the list and can open documents, but the create, promote, and delete actions are not offered to them.

## Notes

**claude** — 2026-08-19T11:29:28Z

Built. The product has a front door: a shell with a Workspace switcher, one list of designs and templates, the creation dialog every document is born in, and the editor's top bar with the name renamed in place. `pnpm run ci` green.

**What landed.** `app/page.tsx` is the list — server-rendered, one row per document, tabs as links. `app/shell.tsx` + `app/workspace-switcher.tsx` are the frame; `app/new-design.tsx` the creation dialog; `app/document-actions.tsx` the per-row promote and the delete confirm; `app/documents/[documentId]/` the editor page, its `document-name.tsx` and the stage its canvas will land in. The behaviour worth testing went to modules, per kjgubg's seam: `lib/canvas-presets.ts` (the six presets, the document a new design starts as, a typed-in dimension), `lib/documents.ts` (which kind a tab asks for, a row's kind and its age), `lib/workspaces.ts` (which Workspace is being read, the cookie that remembers it, what a Viewer is offered), plus the document refusals in `lib/failures.ts` and `editorPath`/`listPath` in `lib/routes.ts`.

**Decisions a reviewer should know.**

- *The switcher's choice is a cookie, not client state.* Every page reads its Workspace on the server — the list is fetched before anything is painted — so the choice has to be part of the request. That is also the whole of "survives a reload": it is already in the request. A choice that is no longer a membership falls back to the first one rather than erroring; nothing about it is worth a message.
- *The tabs filter by asking the api for a kind*, not by dropping rows after they arrive, so there is one place a tab can be wrong rather than two. Order is the api's `updated_at DESC` (qqzqhz) and nothing here re-sorts it.
- *Rename is a save, not a route.* The top bar's input commits on blur or Enter through the ordinary PUT, carrying the document it loaded and the Revision with it, so two tabs renaming meet the same 409 guard every other save does; a refused rename puts the old name back and says why. Escape abandons the edit, and an emptied field is an abandoned edit — a document always has a name.
- *The list-row promote refreshes the list rather than navigating.* Promotion navigating into the new template is editor chrome, and that is 7el0o1's along with everything else after promotion. Delete says in the confirm that a template promoted from the document survives it, because that is what the api does.
- *The editor's Role comes from the Workspace the shell is switched on.* `DocumentView` does not name the document's Workspace, so a document deep-linked from another Workspace can be offered a rename that the api then refuses in words. That gap is its own issue, **mg5asi** — the Assets panel and image drop will need the answer for more than a Role.
- *The canvas takes no token from the theme.* Light and dark are `color-scheme: light dark` and `light-dark()` over the system preference, with no toggle anywhere; the stage paints the document's own background and is sized by the document's own canvas. The compiled preview is n5csrl's — what is here is the space it lands in, behind `validateDocument`, which stays the one authority on whether a stored document is a v1 document.
- *No search, no folders, no duplication*, as the criterion asks; the only empty-state wording that differs is the templates tab's, which says where a template comes from.

**Dependencies.** None new to the project. `apps/web` now declares `@media-canvas/core` (workspace) for the Design Document type, the schema-version constant, and `validateDocument` — the architecture already has the editor importing it.

**Testing.** 8 new tests at kjgubg's seam, in `lib/canvas-presets.test.ts`, `lib/documents.test.ts`, `lib/workspaces.test.ts`, and 3 added to `lib/failures.test.ts`. The issue's two worked examples are literal: the square social preset produces a 1080×1080 document (white, no elements, schemaVersion 1), and the templates tab asks for templates only, so no design can appear in it.

**Verified beyond the tests, with the api stood in.** No Docker and no browser on this machine, so the stack could not be run and the client-side gestures could not be driven. What could be checked was: the production build served against a stand-in api answering `/me`, the Workspace-scoped list, and the document fetch. Confirmed there — both rows render with kind and age; the templates tab shows only the template and the designs tab only the design; the `workspace` cookie changes which Workspace's documents are fetched; a Viewer sees their row and is offered no New design, no Promote and no Delete; the editor shows the name in an input for an Editor and as text for a Viewer, and paints a 1200×630 stage in the document's own `#112233`, not the theme's; an unknown document id is 404; a signed-out caller is 307'd to sign-in. Both app routes build dynamic (ƒ), which is what makes those gates run before anything is painted.

**What no check here can see:** the switcher's cookie write, the creation dialog, the delete confirm, promote, and the rename commit all happen in a browser. Noted on **5wbz53**, which owns that suite.

**Also published: hq3p33.** The spec names tailwindcss and shadcn/ui; neither is installed, and this slice — like jmpc8g before it — is plain CSS. Adopting them, or amending the spec to say the web app stays as it is, is a decision for its own session, not a detour inside this one.
