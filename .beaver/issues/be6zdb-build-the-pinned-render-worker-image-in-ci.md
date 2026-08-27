---
id: be6zdb
title: Build the pinned render worker image in CI
state: done
assignee: agent
priority: medium
depends_on:
    - 6sfpv3
parent: 1qoccb
created: 2026-08-19T01:18:30Z
updated: 2026-08-27T08:28:10Z
---

## What to build

CI builds the pinned render worker image and runs the checks that live inside
it, so that a change which breaks the pinned environment — the Dockerfile, the
Playwright version, the bundled fonts, the compiler — fails on the pull request
instead of on the machine of whoever next bakes a golden baseline. Today those
checks run only when someone runs `pnpm --filter worker run image:check` by
hand.

## Acceptance criteria

- [ ] A CI job builds `apps/worker/Dockerfile` and runs the image's checks inside the built image, on pull requests and on the default branch.
- [ ] The job fails when the running image and the committed environment tuple disagree — the same failure the local command produces.
- [ ] What the job costs in time is either brought down with a build cache the runner keeps between runs, or accepted and written down where the workflow explains itself.
- [ ] The golden harness (6bqdxe) runs its suite in this job when it lands; this issue builds the job, not the fixtures.

## Notes

**agent** — 2026-08-27T06:37:07Z

Seams (AFK): the spec's testing decisions name compile, validate, and render — not CI. This issue is glue: a workflow job that builds apps/worker/Dockerfile and runs the checks that already live in src/checks (environment tuple, smoke, render, and the golden suite from 6bqdxe). The outermost seam that can observe the criteria is the GitHub Actions job itself; there is no new host-testable behavior. The in-image environment check is what fails when the running image and the committed tuple disagree, same as `pnpm --filter worker run image:check`.

**agent** — 2026-08-27T08:28:02Z

Built the worker-image CI job. Closure does not wait for review.

What landed
- `.github/workflows/ci.yml` gained a `worker-image` job on the same triggers as the rest of CI (pull requests and `main`). It builds `apps/worker/Dockerfile` into `media-canvas-worker:pinned` and runs `node --test apps/worker/src/checks/*.check.ts` inside that image — the same command `pnpm --filter worker run image:check` runs after it builds. The in-image environment check is what fails when the running image and the committed tuple disagree.
- Build time is brought down with a BuildKit GitHub Actions cache (`type=gha`, `mode=max`, `scope=worker-image`), documented on the job. `provenance: false` so attestations do not fight `load: true`.
- The golden suite (6bqdxe) is already in `src/checks/*.check.ts`, so this job runs it. No fixtures were added.
- `docs/ARCHITECTURE.md` now says CI builds the image and runs those checks.

Decisions
- Host-side pnpm is not used: Docker builds the image, and the check command is the docker-run half of `image:check`. Installing Node just to invoke docker would add minutes without changing the failure.
- Cache scope is `worker-image` so a later api/web image job does not clobber these layers.

Facts for a reviewer
- Actions are SHA-pinned like the rest of the workflow: docker/setup-buildx-action@37fe631 (v4.3.0), docker/build-push-action@53b7df9 (v7.3.0).
- Docker is denied in this sandbox, so the job was not executed here. `vp check` (format/lint/typecheck, 219/166 files), `vp test` (412), and pytest via the sandbox unix sockets (195) all passed. `pnpm check` itself could not finish: the lockfile supply-chain policy fetch failed against the registry.
