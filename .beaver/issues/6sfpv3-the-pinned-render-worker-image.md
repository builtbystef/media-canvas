---
id: 6sfpv3
title: The pinned render worker image
state: done
assignee: claude
priority: high
depends_on:
    - wupa9j
parent: 1qoccb
created: 2026-08-15T05:49:12Z
updated: 2026-08-19T01:18:51Z
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

**claude** — 2026-08-19T01:18:51Z

Built the pinned image (apps/worker/Dockerfile, Dockerfile.dockerignore, fonts.conf), the committed environment tuple (environment.json, written by src/write-environment.ts), the render environment seam (src/environment.ts), the host test (src/environment.test.ts), and the checks that run inside the image (src/checks/environment.check.ts, smoke.check.ts, fixture.ts). Commands: pnpm --filter worker run image:build / image:check / environment:write, documented in README.md; ARCHITECTURE.md's worker entry gained the image and the tuple.

Decisions:

- BASE IMAGE node:24.18.0-slim, pinned by digest, rather than the Playwright image: the workspace's engines require Node >= 24 with engineStrict, and the Playwright images ship an older Node, so pnpm would refuse the install. The browser builds come from the pinned Playwright itself, which is what a paired build is.
- PLAYWRIGHT-CORE, not playwright, at an exact catalog version (1.62.1, browser revision 1234, Chromium 151.0.7922.34 for both flavors). The full package's postinstall downloads browsers onto every machine that installs the workspace, and browsers belong in the image alone; a caret would let the pair move under a committed baseline. Same library, same spec dependency, without the installer.
- THE TUPLE'S IMAGE IDENTITY is the base digest plus a recipe digest over Dockerfile, Dockerfile.dockerignore and fonts.conf — not the built image's own digest. A local build stamps its own metadata, so two machines building this recipe from this base never agree on a digest and nothing reproducible could be committed. Every other input has its own field.
- COMPILER VERSION is a SHA-256 over packages/core/src with tests excluded, so a compiler change is an environment change by construction; environment.test.ts fails until `pnpm --filter worker run environment:write` is run, and names that command in the failure.
- THE IN-IMAGE CHECKS USE node:test, not vitest: the image installs the worker's subgraph only, where vitest would need the root vite-plus config and toolchain. They are src/checks/*.check.ts, outside vitest's discovery, and never run on the host.
- FONT CONFIGURATION replaces /etc/fonts/fonts.conf and deletes /etc/fonts/conf.d and every system font directory; the replacement names one directory, the bundled set. RENDERS RUN AS uid 10001 with Chromium's own sandbox — it launches in this image with no --no-sandbox flag.

DEVIATION a reviewer should look at, in criterion 3's worked example. Measured: with fontconfig holding only the bundled set, a family the image does not have resolves to a bundled face (fc-match answers Montserrat), not to .notdef. The configuration where nothing can answer — no font directory at all — leaves text invisible and returns an empty font list, which is worse on both halves of the criterion, so it was rejected. What is verified instead: fc-list returns exactly the 21 bundled files, no system font directory exists, and the missing-glyph rule holds where the spec puts it — a glyph no bundled font carries draws the Font Asset's own .notdef (Inter and Lora draw two different boxes, Pacifico's blank .notdef draws nothing at all), never a fallback face. On the render path the case cannot arise: compiled markup carries every face inline as @font-face, so a family is always the embedded Font Asset.

Facts for a reviewer: 9 checks pass inside the image, including two separate browser launches of one document producing byte-identical PNGs. Red proofs were run — mounting a Noto CJK font into the bundled directory fails the font-set check; a tampered /etc/fonts/fonts.conf fails the configuration check; an edit to fonts.conf fails the host tuple test. Measured aside: an intruding face on disk does not reach a render at all (Chromium still drew the embedded font's .notdef), so the font-set check, not the render, is what catches one. The image is 2.1 GB (Chromium 389 MB, headless shell 262 MB, node_modules 207 MB, apt dependencies the rest). pnpm check, pnpm test and pnpm build pass; openapi.json is unchanged. CI does not build the image — outside this issue's criteria, published as be6zdb.
