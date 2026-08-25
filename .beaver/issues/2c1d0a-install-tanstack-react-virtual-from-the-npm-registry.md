---
id: 2c1d0a
title: Install @tanstack/react-virtual from the npm registry
state: todo
priority: low
labels:
    - maintenance
depends_on:
    - p45jd2
created: 2026-08-25T19:33:59Z
updated: 2026-08-25T19:34:01Z
---

## What to build

p45jd2 added `@tanstack/react-virtual` as a `file:` dependency of `apps/web`, with the published 3.13.18 bits checked in under `apps/web/vendor/@tanstack`. That was the only way the implement session could add the library: the sandbox cannot reach `registry.npmjs.org`. The job view itself is done; this is only the install source.

## Acceptance criteria

- [ ] `apps/web` depends on `@tanstack/react-virtual` from the npm registry, not a `file:` path.
- [ ] `apps/web/vendor/` is gone.
- [ ] No other dependency is added or removed.
- [ ] The job view still virtualizes through `useVirtualizer`.
