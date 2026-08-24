---
id: hq3p33
title: The web app has no Tailwind and no shadcn/ui, which the editor spec names
state: in-progress
priority: medium
labels:
    - needs-review
parent: ek7pq1
created: 2026-08-19T11:28:32Z
updated: 2026-08-24T08:46:11Z
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

## Notes

**claude** — 2026-08-24T08:46:11Z

Done, with one criterion I could not exercise — see the last bullet. The decision is the user's: adopt the stack the spec names. `apps/web` is Tailwind v4 + shadcn/ui (Base UI variant), and every surface that existed is converted. `app/globals.css` went from 700 lines of hand-written CSS to ~145 of stock shadcn tokens; nothing in the app carries a bespoke class name any more.

WHAT WAS BUILT
- Tailwind v4 through `apps/web/postcss.config.mjs` (v4 has no JS config). `app/globals.css` is the stock `base-nova` token set at `baseColor: neutral`, plus the `@theme inline` mapping and the base layer, and `components.json` records that.
- shadcn components as owned source under `components/ui`: button, input, label, select, dialog, alert-dialog, checkbox, separator, card, slider, toggle, toggle-group. `lib/utils.ts` is the `cn` helper. `@/*` is now a path alias in `tsconfig.json`, which is how the registry writes its imports.
- Converted: the sign-in and workspace-creation pages (Card + Label + Input + Button), the shell (Select workspace switcher, ghost-button links), the document list (button-variant tabs, bordered rows), the creation dialog (Dialog), the delete confirm (AlertDialog — it is a choice, so escape must not stand in for cancelling), the editor top bar and rename field, the layer tree (lucide eye icons), the tool palette (ToggleGroup instead of hand-rolled `aria-pressed`), and the whole inspector (Label/Input/Select/Checkbox/Button, and Slider for gradient stop offsets).
- `components/problem.tsx` is the one shared app component: the always-present `role="alert"` live region, hidden while empty. It was a repeated CSS class before.

DECISIONS TAKEN WHILE BUILDING
1. THE `shadcn` PACKAGE IS NOT INSTALLED. Upstream's `globals.css` starts `@import "shadcn/tailwind.css"` — the custom variants (`data-open:`, `data-checked:`, …) and utilities every registry component is written against. That needs the CLI package as a project dependency, and `trustPolicy: no-downgrade` in `pnpm-workspace.yaml` refuses its tree (`@babel/core` -> `semver@6.3.1`, provenance dropped between releases). Vendored verbatim to `app/shadcn.css` instead — verified byte-identical to shadcn 4.19.0's `dist/tailwind.css` — excluded from the formatter in `vite.config.ts`, with the refresh command in its header. The supply-chain policy is the older decision and it wins.
2. DARK IS THE MEDIA QUERY, NOT A CLASS. Tailwind v4's `dark:` variant already means `prefers-color-scheme: dark`, so upstream's `@custom-variant dark (&:is(.dark *))` is deleted and the dark token values are declared under that media query. No `.dark` class, no `next-themes`, no toggle. Verified in the built CSS: light tokens on `:root`, dark tokens inside `@media (prefers-color-scheme:dark){:root{…}}`, and the components' own `dark:` utilities compile into the same query.
3. THE PRESET'S FONT IS NOT TAKEN. `nova` ships Geist via `next/font/google`; `--font-sans` stays the system stack so rendering a page fetches nothing at build time. One token to change if that is ever wanted.
4. Base UI's `Select.Value` stringifies the raw value unless the root is given `items` — without it the switcher would show a workspace id and the inspector would show "left" where "Left" belongs. Both roots now pass an `items` map. This is the kind of thing that only shows at runtime, which is why it is called out here.

THE CANVAS IS STILL THE DOCUMENT'S OWN
The compiled SVG's host div carries only the shadow it casts on the stage. Tailwind's preflight was checked against the built CSS: the only rule reaching `svg` is `vertical-align:middle;display:block`, which is exactly what the deleted `.canvas > svg` rule did. Nothing sizes or paints it, `border-color`/`outline-color` from the base layer are inert on SVG, and the compiler emits `font-family` per text element so nothing inherits from `html`. The compiler emits one `<svg>` (compile.ts:959), so `display:block` reaches the same single node it used to.

CHECKS
`pnpm check` green (format + lint + typecheck, 141 files / 91 checked). `pnpm build` green, no OpenAPI or api-client drift. The TypeScript suite is green — 21 files, 235 tests. `apps/api`'s pytest suite errors on `SettingsError: The environment does not describe a runnable api`; that reproduces identically with this branch stashed, so it is this machine's missing api environment, not this change.

WHAT A REVIEWER MUST DO — this is why the issue is not closed
The fourth criterion ("the pages still render for a signed-out caller, a Viewer, and an Editor") was NOT exercised. This session's sandbox gives each shell command its own network namespace and denies docker, so the dev stack could not be reached even with `next dev` running, and no page was ever loaded in a browser. Everything above is static verification: it compiles, it typechecks, the CSS contains the utilities and the theme, but nobody has looked at it. A whole-app restyle deserves an eye. Bring the stack up, sign in, and walk the four surfaces — list, creation dialog, delete confirm, editor with something selected — in light and dark. Then close to approve, or note what to change and remove `needs-review`.
