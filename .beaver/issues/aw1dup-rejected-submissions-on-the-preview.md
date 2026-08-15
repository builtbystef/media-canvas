---
id: aw1dup
title: Rejected submissions on the preview
state: todo
priority: medium
depends_on:
    - 39y4fh
parent: wz3ev2
created: 2026-08-15T07:29:20Z
updated: 2026-08-15T07:29:20Z
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
