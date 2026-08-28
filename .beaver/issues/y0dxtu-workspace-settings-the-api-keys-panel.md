---
id: y0dxtu
title: 'Workspace settings: the API keys panel'
state: done
assignee: agent
priority: medium
depends_on:
    - t3n0fj
    - hddsdp
parent: 88v6vg
created: 2026-08-15T06:23:03Z
updated: 2026-08-28T20:56:10Z
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

## Notes

**agent** — 2026-08-28T20:56:06Z

Built the API keys panel. `/settings` now has a fourth panel: mint a key, copy it once, revoke one. Owner-only, visible but inert for Editors and Viewers. `pnpm check` green. 433 TS tests green. API tests not re-run (web-only slice; sandbox cannot reach loopback Postgres).

**What landed.** `ApiKeysPanel` on the settings page. Create asks only for a name, then an AlertDialog reveals the plaintext with Copy and the statement that it will not be shown again. Escape and overlay do not dismiss it — only Done does. The listed row is name, `mc_`+prefix, created, last used; unused keys say "Never used". Revoke confirms and says anything using the key stops working immediately. Keys are not fetched for a Role the api would refuse.

**Seam.** The web app's pure modules (88v6vg third seam / kjgubg). Behaviour in `lib/settings.ts` (Owner-only wording, listed-after-create without the secret, created/last-used/prefix labels, reveal and revoke warnings) and `lib/failures.ts`. The page stays a gate and a hand-off — no component harness.

**Decisions a reviewer should know.**

- *The reveal is controlled and cancel-on-close.* AlertDialog already refuses overlay clicks; `onOpenChange` also cancels Escape. Done is a button that drops the `CreatedKey` from state. After that, only `KeyView` remains — the same shape a reload fetches.
- *The list never holds the secret.* `listedAfterCreate` strips `key` as soon as the mint returns, so the new row is already on the page while the reveal is open.
- *Prefix is shown as `mc_` plus the eight characters.* Enough to recognise the key that was copied, not enough to be it.

**Testing.** `lib/settings.test.ts` (the six key criteria) and `lib/failures.test.ts` (create/revoke refusals).
