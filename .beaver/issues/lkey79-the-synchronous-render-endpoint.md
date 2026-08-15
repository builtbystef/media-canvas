---
id: lkey79
title: The synchronous render endpoint
state: todo
priority: high
depends_on:
    - 1dxm2u
    - sazdn4
    - qqzqhz
parent: 0egsmf
created: 2026-08-15T06:54:29Z
updated: 2026-08-15T07:13:26Z
---

## What to build

Anyone with the rights to a document can turn it into a file in one call. A Template is given one value per Variable and answers with the rendered bytes; a plain design is given nothing and answers with its own export. There is no job, no polling, and nothing stored — the response is the delivery. This is the call the editor's Generate dialog makes, and the first end-to-end path through this system: request, validation, compile, browser, bytes.

The document this route reads belongs to the editor spec (ek7pq1), which is not sliced yet; this issue's blocking edge points at that spec's umbrella. Retarget it to the slice that lands the documents table when that spec is sliced.

## Acceptance criteria

- [ ] Rendering a document returns the file bytes with the content type of the requested format: png at scale one, two, or three; jpeg with an optional quality defaulting to 90; pdf.
- [ ] A Template validates the supplied values and refuses the whole call with named-Variable errors when any value is wrong. Worked example: a Template with one required Variable, called with no values → 422 naming that Variable, and no bytes.
- [ ] A design renders with no values, and supplying any value for a design is a refusal rather than silently ignored — this route is how a plain design becomes a file.
- [ ] Nothing is persisted: the same call twice produces two responses, leaves no record, and stores no object.
- [ ] Access is decided by the document's Workspace and the caller's rights there, through the shared mechanism the accounts work established: creating a render is an Editor-level action, a Viewer is refused, and a caller with no Membership is refused in a way that does not reveal whether the document exists.
- [ ] The route lives under the public API prefix, which is versioned independently of the document schema version.
- [ ] Value validation is the worker's, not a second implementation in the api: the api passes the values through and hands back the named-Variable errors it receives. The one refusal the api makes on its own is a design given values.
- [ ] Tests drive the route with the worker's contract stood in, covering the bytes case for both document kinds, the named-error case, and the refusal a design with values earns without the worker being called.

## Notes

**claude** — 2026-08-15T07:13:26Z

Retargeted 2026-08-15 (ek7pq1 issue-slicing session): the placeholder edge on the ek7pq1 umbrella is replaced by edges on the slices that actually gate this work. No umbrella edges remain anywhere in the tracker.
