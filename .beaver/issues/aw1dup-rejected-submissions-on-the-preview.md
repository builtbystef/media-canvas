---
id: aw1dup
title: Rejected submissions on the preview
state: done
assignee: agent
priority: medium
depends_on:
    - 39y4fh
parent: wz3ev2
created: 2026-08-15T07:29:20Z
updated: 2026-08-29T06:46:25Z
---

## What to build

A refused submission is a fix loop, not a dead end. The server rejects a bad file whole — nothing is stored, nothing is rendered — and its errors come back keyed to row indexes and Variable names. Those errors land on the preview that is already open: the offending rows marked in place, a grouped list above the table for the ones scattered too far to scroll to, and a plain count of how many rows are wrong and that none of them were submitted. The fix is made in the source file, and the file is picked again.

## Acceptance criteria

- [ ] A refusal merges into the open preview rather than replacing it: the file, its parsed rows, and the mapping summary all stay on screen.
- [ ] Each offending row is marked in the table carrying the message that names its Variable. Worked example: an error for row index 3 on the Variable `price` marks the fourth data row, because row indexes count data rows from zero and the header row does not shift them.
- [ ] A count line states how many rows are invalid and that nothing was submitted. Worked examples: 14 offending rows → "14 rows invalid; nothing was submitted"; two errors on one row → "1 row invalid; nothing was submitted".
- [ ] A control jumps to the first offending row, scrolling the virtualized table to it.
- [ ] A compact list above the table groups the errors by row, identifying each row by its index and by its name where the file supplied one, and each entry jumps to its row.
- [ ] The dialog stays open and does not navigate: no job was created, and the interface says so rather than implying a partial batch exists.
- [ ] Picking a file again clears the previous errors before the new preview is shown.
- [ ] The merge of a refusal into a parsed preview is tested as pure logic against a refusal body, without a browser.

## Notes

**agent** — 2026-08-29T06:40:47Z

Seams for this AFK session (spec Testing Decisions, seam 1 — client pure logic, Vitest, no browser):

Merge a 422 refusal body into a parsed preview. The overlay is computed from the body's `errors` (rowIndex + Variable + message) and the preview's headers/rows; the preview itself is not replaced. Worked examples from the issue: row index 3 marks the fourth data row; 14 offending rows → "14 rows invalid; nothing was submitted"; two errors on one row → "1 row invalid; nothing was submitted"; groups carry the row index and `_name` when the file supplied one.

submitBatch surfaces the 422 body so the overlay can be applied. UI (marks, jump-to-first, grouped list, dialog stays open, pick-again clears) sits on that overlay. Jumping the virtualized table is a scrollToIndex call, not a logic seam.

**agent** — 2026-08-29T06:46:23Z

Built the 422 overlay on the Batch preview.

**What landed.** `mergeRefusal` takes a parsed preview and a refusal body (`errors` keyed by rowIndex and Variable) and returns the overlay: messages per data-row index, groups with `_name` when the file supplied one, the first offending index, and the count line. `submitBatch` returns that body on 422 so the dialog can merge it. The dialog stays open — no navigation, no job. Offending rows are marked in the table with the Variable-named message; a count line and a compact grouped list sit above the table; both the list and a jump control scroll the virtualized table. Picking a file again nulls the overlay before the new parse is shown.

**Seam.** Spec seam 1 (Vitest, no browser). Worked examples are literal: row index 3 marks the fourth data row as `price: must be a number` and the count line reads "1 row invalid; nothing was submitted"; 14 rows / two errors on one row match the issue's strings.

**Decisions a reviewer should know.**
- Messages follow the job view's `variable: message` form so a Variable is named even when the server's text does not repeat it.
- The refusal body is the contract's `{ errors: [...] }` (BatchRefusal), not the spec's abbreviated array.
- No review gate on this slice.

Tests: `apps/web/lib/batch.test.ts`. `pnpm check` and `pnpm test` green.
