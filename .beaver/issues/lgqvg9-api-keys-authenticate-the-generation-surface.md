---
id: lgqvg9
title: API keys authenticate the generation surface
state: todo
priority: medium
depends_on:
    - t3n0fj
    - lkey79
    - kjsmdy
parent: 88v6vg
created: 2026-08-15T06:24:01Z
updated: 2026-08-15T06:54:56Z
---

## What to build

The point of an API key: a script renders and generates without a browser session. This closes the loop the key work could only half-prove — the permitted case, on the routes that generate assets, scoped to the key's own Workspace.

Blocking edge note: this depends on the generation-platform spec for the render and job routes. When that spec is sliced, retarget this edge from the spec issue to the slice that lands them.

## Acceptance criteria

- [ ] A valid key authenticates the whole generation surface as an Editor of the key's Workspace: a single render, submitting a batch, polling it, cancelling it, deleting it, and downloading per-Row outputs and the archive.
- [ ] Worked example: a script holding only a key renders a document in its Workspace and downloads the result, never touching a cookie.
- [ ] A key is scoped to its own Workspace. Worked example: a key from Workspace A used against a document in Workspace B is refused, and the response does not disclose whether that document exists.
- [ ] A key remains refused with 403 outside the generation surface, and 401 once revoked — the rules the key work already established, now proven against real generation routes.
- [ ] A Viewer's cookie is refused where an API key is accepted, since a key carries Editor rights and a Viewer does not.

## Notes

**claude** — 2026-08-15T06:54:56Z

Retargeted 2026-08-15: the cross-spec edge on the 0egsmf umbrella is replaced by edges on the two slices that land the permitted case — lkey79 (the synchronous render endpoint) and kjsmdy (job submission and polling). Those two are the generation surface a key must be accepted on; the refused cases were already provable without them.
