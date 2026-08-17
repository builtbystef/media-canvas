---
id: hddsdp
title: 'Workspace settings: members and invites panels'
state: todo
priority: medium
depends_on:
    - k7wegl
    - jmpc8g
parent: 88v6vg
created: 2026-08-15T06:22:53Z
updated: 2026-08-15T06:22:53Z
---

## What to build

The settings area where an Owner runs their Workspace's access without a terminal: who is in it and with what Role, and who has been invited but has not arrived yet. This slice also establishes the settings area itself — its route, its layout, and how it refuses people who are not Owners.

## Acceptance criteria

- [ ] The settings area is reachable from the product for any member; panels whose actions are Owner-only are visible but inert for Editors and Viewers, and the area never offers an action the api will refuse.
- [ ] The members panel lists every member with their email and Role, and lets an Owner change a Role or remove a member.
- [ ] The last-Owner rules surface as messages, not as failures. Worked examples: an Owner trying to demote the only Owner is told why it is refused; the same Owner trying to leave is told to promote someone first.
- [ ] Any member can leave from this area, with a confirmation, and lands outside the Workspace afterwards.
- [ ] The invites panel lists pending invites with their email, Role, and when they expire, and lets an Owner send a new one by email and Role, or revoke one.
- [ ] Inviting an address that already has a pending invite replaces it, and the panel shows one entry rather than two.
- [ ] The panel states plainly that an invite email has been sent, including in development where it lands in the api log.
- [ ] The settings area also carries the Workspace itself: an Owner renames it in place through the existing workspace surface (sazdn4), and deletes it behind an explicit confirm that warns members lose access and stored files are removed irreversibly. The deletion and storage-purge semantics themselves belong to sazdn4 and 36ty5a — this panel only fronts them.
