---
id: hq3p33
title: The web app has no Tailwind and no shadcn/ui, which the editor spec names
state: in-progress
priority: medium
labels:
    - needs-review
parent: ek7pq1
created: 2026-08-19T11:28:32Z
updated: 2026-08-24T10:33:06Z
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

**claude** — 2026-08-24T09:12:07Z

FOLLOW-UP, same session, after the user reviewed the note above. Two of its decisions are reversed on the user's instruction; the review ask at the bottom of that note still stands.

- DECISION 1 IS REVERSED — `shadcn` IS INSTALLED. The blocking downgrade was `semver@6.3.1`, a 2023 release under `@babel/core` that predates provenance rather than one that lost it. `pnpm-workspace.yaml` gains `trustPolicyExclude: [semver]` beside `trustPolicy: no-downgrade`, carrying that reason. `shadcn` is a devDependency of `apps/web` — build-time only, which is where `@import "shadcn/tailwind.css"` is resolved, and consistent with `tailwindcss` and `@tailwindcss/postcss` already sitting there. `app/globals.css` imports from the package again, `app/shadcn.css` is deleted, and the `vite.config.ts` formatter carve-out that existed only for it is gone with it. `minimumReleaseAge` pins 4.18.0 rather than the 4.19.0 the registry served the components from; the two ship a byte-identical `tailwind.css`, checked before deleting the vendored copy.
- DECISION 3 IS REVERSED — GEIST IS THE FACE. `next/font/google` self-hosts it: five woff2 files land in the build and the browser fetches nothing from Google, so the argument for the system stack ("nothing fetched at build time") was not worth the departure from the preset.
- ONE HAZARD FOUND AND AVOIDED WHILE WIRING IT. Upstream's scaffold gives `next/font` the variable `--font-sans` and also declares `--font-sans` in `@theme inline`, so `<html>` ends up with two declarations of one custom property, one of which is `--font-sans: var(--font-sans)`. A custom property that resolves to itself is a cycle, and CSS drops a cyclic property outright — which leaves whether the face renders at all decided by which declaration the cascade picks. Here `next/font` gets `--font-geist` and the theme maps `--font-sans: var(--font-geist), system-ui, sans-serif`. Verified in the built CSS: `--font-geist:"Geist", "Geist Fallback"` on the document element, `html{font-family:var(--font-geist), system-ui, sans-serif}`, six `@font-face` rules pointing at `/_next/static/media`.

Checks re-run after the change: `pnpm check` green (141 formatted, 91 checked), `pnpm build` green, 235 TypeScript tests green. `apps/api`'s pytest still errors on the missing api environment, unchanged and unrelated. STILL UNVERIFIED, and still the reason this issue is open: nothing has been rendered in a browser — see the last section of the previous note for what to walk through.

**claude** — 2026-08-24T10:23:54Z

Exercised against a running stack on 2026-08-24, which the first pass could not do. Two regressions from the conversion, both fixed in dafc9ea.

1. Resize, scale, and rotate were dead. Pointer-down asks `closest` for `.selection-handle` and `.rotation-zone`; the conversion replaced those marker classes with Tailwind utilities and did not put the markers back, so every lookup answered null and each gesture returned early. Hit-testing now reads `data-handle` and `data-rotate`, and the comment above the placement tables names them as the contract so the next restyle does not drop them again.

2. The alignment toolbar clipped six of eight labels — 'horizontal centres' rendered as 'rizontal centr', cut at both ends. shadcn's Button is nowrap and fixed-height, so `truncate` on a centred flex row clips symmetrically and never draws an ellipsis. Labels wrap to a second line now, and the two grids are back to the one three-column grid the CSS had.

Verified in the browser: rect draws, bottom-right handle resizes 561x686 to 811x1060 with x/y unchanged, top-left rotation zone turns it to 78.9 degrees, tool palette arms by click and by keyboard, workspace and inspector Selects show names rather than raw values, the canvas keeps its own white against the app's theme.

Found but NOT fixed: vt33m4, published at high priority. `handle` is `undefined` rather than `null` when a press misses a handle, so `handle !== null` passes and every canvas press is taken for a handle drag once anything is selected — the selection cannot be changed or cleared with the pointer. Byte-identical in 745cab2, so it predates this issue; it comes from the resize slice (7ih7wa) and had been latent because the editor had not been run against a live stack.

Also worth knowing for whoever reviews: the editor could not draw at all until the nine bundled families were uploaded by hand, because vn4r07 (seed bundled fonts into a new Workspace) is still todo. Any fresh Workspace hits the same wall.

Checks: pnpm check green, 21 test files / 235 TypeScript tests green. apps/api pytest still fails with 118 SettingsError in this sandbox, which reproduces on a clean tree — the environment cannot read .env.

Still open for the reviewer: dark mode was not walked, and neither were the signed-out, Viewer, and Editor variants of the document list. Close to approve, or note what to change and remove needs-review.

**claude** — 2026-08-24T10:33:06Z

Dark walked in the user's own Chrome (Claude in Chrome, not the proxied sandbox browser), so this covers real rasterisation and compositing rather than an HTTP bridge.

Dark, system preference only, no toggle anywhere: document list, New design dialog, editor, inspector, delete AlertDialog. All read correctly.

Criterion 3 confirmed by eye rather than by argument: on a dark page the Canvas is white, because the document paints its own background. The only app-owned thing touching it is the shadow it casts on the stage.

Both dafc9ea fixes re-confirmed in the real browser: bottom-right handle resized 593x742 to 802x1185 with x/y unchanged, then 891x1334; the top-left rotation zone turned the rect to 26 degrees. Alignment toolbar labels wrap and are fully legible in dark.

Base UI Select labels are names everywhere they appear: workspace shows 'Test Workspace', Visible shows 'Visible', Alignment 'Left', Growth anchor 'Top' — no raw ids or booleans.

Not a regression, noted so no one re-reports it: the Typography section's Font Asset is a plain text input holding the asset hash, not a family picker. Byte-identical in 745cab2 — the picker is later work, and vn4r07's criteria are where it is written down.

One anomaly seen once and NOT reproduced: after a handle drag the tool palette showed Ellipse pressed when Select had been armed. Six deliberate attempts to reproduce failed — arming by click and by keyboard both track the store, and Select survives a resize drag. Recording it rather than filing it, since I could not make it happen twice.

Still not covered: the signed-out caller and the Viewer role. Testing those means clearing the user's own session, so it stays with the reviewer.
