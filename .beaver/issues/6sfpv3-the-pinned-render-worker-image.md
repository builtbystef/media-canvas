---
id: 6sfpv3
title: The pinned render worker image
state: todo
priority: high
depends_on:
    - wupa9j
parent: 1qoccb
created: 2026-08-15T05:49:12Z
updated: 2026-08-17T04:00:39Z
---

## What to build

The render worker runs in one image where every input that can move a pixel is pinned, because that is the only environment in which a re-render a year from now, or a golden baseline, means anything. Someone can build this image, render inside it, and get the same bytes as the last person who did.

## Acceptance criteria

- [ ] The image pins the Playwright version together with its paired browser build, and launches full Chromium in new headless mode — not the headless shell — for every render.
- [ ] The image also carries the same Playwright version's paired `chrome-headless-shell` build, present solely so the golden harness's one cross-flavor parity fixture (6bqdxe) can run both flavors in one pinned environment. Nothing on the render path ever launches it, and the environment tuple records both browser builds.
- [ ] Font configuration inside the image points at the bundled font set and nothing else. Worked example: asking the image for the list of available fonts returns only the bundled files, and text requesting a family the image does not have draws `.notdef` rather than a substituted system face.
- [ ] Viewport, device scale factor, locale, timezone, and color scheme are fixed inside the image rather than inherited from whatever host runs it.
- [ ] The environment tuple that binds golden baselines is recorded in a committed file the render checks can read: image digest, Playwright package and browser revision, headless flavor, font set identity, font configuration, viewport, device scale factor, locale, timezone, and the compiler and schema versions.
- [ ] A smoke test that runs inside the image launches Chromium, screenshots a trivial compiled document, and asserts two consecutive runs produce byte-identical output.
- [ ] The local development stack can build and run the image with the project's ordinary commands.

## Notes

**claude** — 2026-08-17T04:00:39Z

Decision: the pinned image also carries the paired chrome-headless-shell build, solely for the golden harness cross-flavor parity fixture (6bqdxe). The render path never launches it, and the environment tuple records both browser builds.
