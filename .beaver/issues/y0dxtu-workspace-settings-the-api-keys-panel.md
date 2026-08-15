---
id: y0dxtu
title: 'Workspace settings: the API keys panel'
state: todo
priority: medium
depends_on:
    - t3n0fj
    - hddsdp
parent: 88v6vg
created: 2026-08-15T06:23:03Z
updated: 2026-08-15T06:23:03Z
---

## What to build

The panel where an Owner mints a key for a script and copies it — once. Everything about this panel exists to make that single moment survivable: the key is shown plainly, the fact that it will never be shown again is stated before it disappears, and what remains afterwards is enough to recognise a key without revealing it.

## Acceptance criteria

- [ ] The panel lists a Workspace's keys with their name, prefix, when they were created, and when they were last used — never the key itself.
- [ ] Creating a key asks only for a name and then reveals the plaintext key with a copy action and an explicit statement that it will not be shown again; dismissing the reveal is deliberate, not accidental.
- [ ] Once the reveal is dismissed, nothing in the product can show that key again. Worked example: reloading the settings page after creating a key shows the new row with its prefix and no way back to the value.
- [ ] Revoking a key asks for confirmation and says what breaks — anything using that key stops working immediately.
- [ ] A key that has never been used shows that plainly rather than an empty column.
- [ ] The panel is Owner-only, consistent with the rest of the settings area, and shows Editors and Viewers why they cannot act rather than hiding the panel.
