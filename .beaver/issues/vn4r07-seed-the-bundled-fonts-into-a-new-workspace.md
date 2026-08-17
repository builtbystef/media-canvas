---
id: vn4r07
title: Seed the bundled fonts into a new Workspace
state: todo
priority: medium
depends_on:
    - sazdn4
    - 21plhn
    - wupa9j
parent: 88v6vg
created: 2026-08-15T06:23:42Z
updated: 2026-08-15T07:13:26Z
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
