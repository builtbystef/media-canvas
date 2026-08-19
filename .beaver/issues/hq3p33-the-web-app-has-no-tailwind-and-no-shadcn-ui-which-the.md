---
id: hq3p33
title: The web app has no Tailwind and no shadcn/ui, which the editor spec names
state: todo
priority: medium
parent: ek7pq1
created: 2026-08-19T11:28:32Z
updated: 2026-08-19T11:28:32Z
---

## What to build

The editor spec (ek7pq1) names **tailwindcss** and **shadcn/ui (Base UI variant)** as dependencies, and says the theme is "stock shadcn tokens". Neither is installed. Two slices have now shipped without them: jmpc8g wrote the sign-in and Workspace-creation pages in plain CSS, and hg52gb wrote the shell, the document list, the creation dialog and the editor's top bar the same way — hand-written tokens in `apps/web/app/globals.css`, `light-dark()` for the theme, and plain elements for the two dialogs.

Nothing is broken by that, and both slices' criteria are met. What is open is whether the spec's component stack arrives at all, because the slices that follow are where it would pay: the inspector (gw6v31), the Variables panel (7el0o1), the Assets panel (qbbli8) and the Generate dialog (uemwae) are dense with controls that shadcn ships and this app would otherwise hand-write — and the longer it waits, the more plain CSS there is to convert.

This issue is the decision as much as the work: adopt the stack the spec names and convert what exists, or amend the spec's Dependencies section to record that the web app stays on plain CSS. It is not a detour either of those slices should take on its own.

## Acceptance criteria

- [ ] The choice is made and recorded where the next slice will find it: the spec's Dependencies section, or a note that amends it.
- [ ] If the stack is adopted: tailwindcss and shadcn/ui are installed with the reason `docs/CODING_STANDARDS.md` asks for, the existing pages are converted, and light and dark still follow the system preference with no toggle.
- [ ] The canvas stays theme-independent either way — a document paints its own background.
- [ ] `pnpm run ci` is green, and the pages still render for a signed-out caller, a Viewer, and an Editor.
