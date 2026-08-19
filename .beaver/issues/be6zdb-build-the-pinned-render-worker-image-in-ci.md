---
id: be6zdb
title: Build the pinned render worker image in CI
state: todo
priority: medium
depends_on:
    - 6sfpv3
parent: 1qoccb
created: 2026-08-19T01:18:30Z
updated: 2026-08-19T01:18:30Z
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
