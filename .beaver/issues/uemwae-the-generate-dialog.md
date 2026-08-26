---
id: uemwae
title: The Generate dialog
state: done
assignee: agent
priority: medium
depends_on:
    - lkey79
    - 0y2iw3
parent: ek7pq1
created: 2026-08-15T07:12:55Z
updated: 2026-08-26T18:24:21Z
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

## Notes

**agent** — 2026-08-26T18:14:53Z

Seams for this AFK session (spec Testing Decisions, seam 1 — the outermost that can observe the criteria without a browser):

1. Pure generate form logic — initial values from Variable defaults; inline constraint checking via core `validate` (not a second implementation); the format picker as exactly one of PNG×1/2/3, JPEG+quality, or PDF; the download name from the document name.
2. The generate call — POST /documents/{id}/render (injected, like promote.ts). A design sends no values; a template sends the form values. 200 returns the bytes and the filename; a 422 named-Variable error is attached to that input; any other refusal stays in the dialog as the message it came back with. The call does not save or mutate the document.

UI (top-bar Generate, the dialog, typed controls, the browser download) sits on those. Viewer is read-only: the button follows mayEdit, matching Promote and the Editor-level render route.

**agent** — 2026-08-26T18:24:21Z

Built the Generate dialog at the two seams recorded at the start of this session.

Pure generate module (apps/web/lib/generate.ts): initial values from Variable defaults; inline constraint checking via core validate on the declarations alone (so an Unknown Token cannot hide a minLength error); format picker as exactly one of PNG×1/2/3, JPEG+quality (default 90, clamped 1–100), or PDF; download name from the document name.

The generate call posts POST /documents/{id}/render. A design sends no values; a template sends the form. 200 returns the bytes and the filename; a 422 named-Variable error attaches to that input; any other refusal stays in the dialog as the message it came back with. The call does not save or mutate the document.

UI: Generate in the editor top bar for both kinds (Editor-only, matching Promote). Template dialog is one typed input per Variable plus the format picker; a design is the picker alone. Errors keep the dialog open.

No new dependency. Spec has no review gate on this slice.
