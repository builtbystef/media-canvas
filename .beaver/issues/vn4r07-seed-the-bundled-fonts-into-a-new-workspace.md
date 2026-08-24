---
id: vn4r07
title: Seed the bundled fonts into a new Workspace
state: done
assignee: agent
priority: medium
depends_on:
    - sazdn4
    - 21plhn
    - wupa9j
parent: 88v6vg
created: 2026-08-15T06:23:42Z
updated: 2026-08-24T17:50:47Z
---

## What to build

A Workspace is usable the moment it is created: the nine bundled font families are already in it, so the first design a member opens has type to set. Because every Font Asset belongs to exactly one Workspace, seeding happens per Workspace at creation rather than once for the instance.

## Acceptance criteria

- [ ] Creating a Workspace seeds the bundled font families into it, marked as bundled.
- [ ] Seeding is idempotent: running it again over a Workspace that already has them changes nothing and creates no duplicates.
- [ ] Two Workspaces created by the same User each hold their own copies, and deleting a font in one leaves the other untouched.
- [ ] A bundled font cannot be deleted from a Workspace, and the refusal names the reason rather than failing generically.
- [ ] A newly created Workspace opens a design and sets text in a bundled family with no upload step. Worked example: immediately after creation, the font picker lists the nine bundled families.

## Notes

**claude** — 2026-08-15T07:13:26Z

Retargeted 2026-08-15 (ek7pq1 issue-slicing session): the placeholder edge on the ek7pq1 umbrella is replaced by edges on the slices that actually gate this work. No umbrella edges remain anywhere in the tracker.

**agent** — 2026-08-24T17:50:47Z

Completed Workspace bundled-font seeding. Creating a Workspace now copies all 21 vendored faces (nine families) under that Workspace's storage prefix, inserts bundled Font Asset rows from packages/fonts/manifest.json, and commits the Workspace, Owner Membership, and font rows together. Re-seeding first reads the Workspace's existing bundled ids, so a complete Workspace performs no database or object-store writes; concurrent attempts remain protected by the composite Font Asset key. The manifest now also carries parser-verified subfamily and PostScript metadata so seeded records do not guess at filenames. Existing bundled-font deletion refusal remains the named 409 asset_is_bundled response.

Testing stays at the parent spec's public HTTP seam: tests create and list a new Workspace's nine families, create a design that names and serves a bundled Font Asset without inspection/upload, verify two Workspaces have separate object copies and deleting an uploaded copy in one leaves the other, and exercise the bundled deletion refusal. Because re-seeding has no product route, that operation is triggered through the seeding domain interface, then its no-change claim is observed through the HTTP list and exact object-store listing. Existing font/image storage assertions now account for the 21-object baseline. The bundled-font package test independently verifies the added manifest metadata against opentype.js.

Checks: pnpm check; all 238 TypeScript tests via vp test; all 121 api tests against real Postgres and Garage; pnpm build with regenerated OpenAPI/client.
