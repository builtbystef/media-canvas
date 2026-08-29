---
id: lgqvg9
title: API keys authenticate the generation surface
state: done
assignee: agent
priority: medium
depends_on:
    - t3n0fj
    - lkey79
    - kjsmdy
    - lcni96
    - 211q1b
parent: 88v6vg
created: 2026-08-15T06:24:01Z
updated: 2026-08-29T06:36:37Z
---

## What to build

The point of an API key: a script renders and generates without a browser session. This closes the loop the key work could only half-prove — the permitted case, on the routes that generate assets, scoped to the key's own Workspace.

## Acceptance criteria

- [ ] A valid key authenticates the whole generation surface as an Editor of the key's Workspace: a single render, submitting a batch, polling it, cancelling it, deleting it, and downloading per-Row outputs and the archive.
- [ ] Worked example: a script holding only a key renders a document in its Workspace and downloads the result, never touching a cookie.
- [ ] A key is scoped to its own Workspace. Worked example: a key from Workspace A used against a document in Workspace B is refused, and the response does not disclose whether that document exists.
- [ ] A key remains refused with 403 outside the generation surface, and 401 once revoked — the rules the key work already established, now proven against real generation routes.
- [ ] A Viewer's cookie is refused where an API key is accepted, since a key carries Editor rights and a Viewer does not.

## Notes

**claude** — 2026-08-15T06:54:56Z

Retargeted 2026-08-15: the cross-spec edge on the 0egsmf umbrella is replaced by edges on the two slices that land the permitted case — lkey79 (the synchronous render endpoint) and kjsmdy (job submission and polling). Those two are the generation surface a key must be accepted on; the refused cases were already provable without them.

**agent** — 2026-08-29T06:36:35Z

Done. Seam: the public HTTP API (spec 88v6vg seam 1), with a real Postgres, a recording worker, and the compose object store.

What landed. `is_generation_surface` is now the default the middleware uses: sync render, job submit, poll, cancel, delete, per-Row outputs, and the archive. `caller_in` is the shared identity the Workspace, document, Template, and Job gates read — a key is an Editor of its own Workspace and of no other. Tests in `apps/api/tests/test_generation_keys.py` walk the permitted case with no cookie, the cross-Workspace 404 that does not disclose, 403 outside the surface / 401 once revoked on a real render, and a Viewer cookie refused where a key is accepted.

Not on the surface: listing a Workspace's Jobs. The spec names poll (GET /jobs/{id}), not the list.
