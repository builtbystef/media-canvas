---
id: uemwae
title: The Generate dialog
state: todo
priority: medium
depends_on:
    - lkey79
    - 0y2iw3
parent: ek7pq1
created: 2026-08-15T07:12:55Z
updated: 2026-08-15T07:12:59Z
---

## What to build

One click from the canvas to a file. For a template the dialog asks for one value per Variable, prefilled with its default and checked as it is typed; for a design it asks only what format. Then it calls the synchronous render endpoint and hands the response over as a download. Nothing is stored, and what comes back is exactly what a batch of that template would produce, because it is the same path.

## Acceptance criteria

- [ ] A generate action in the top bar opens the dialog for both document kinds.
- [ ] For a template the dialog shows one typed input per declared Variable, prefilled with its default, with the type's own control and its constraints enforced inline before the call is made. Worked example: a text Variable with a minimum length, left empty, blocks the button and says why.
- [ ] For a design the dialog is the format picker alone.
- [ ] The format picker offers PNG at one, two or three times, JPEG with a quality, and PDF, and exactly one of them per generation.
- [ ] Generating calls the synchronous render endpoint and delivers the returned bytes to the browser as a download named after the document.
- [ ] An error from that call is shown in the dialog in the terms it came back with — a named-Variable error points at the input it belongs to — and the dialog stays open.
- [ ] Nothing is persisted by generating: no record, no stored file, and no change to the document.
