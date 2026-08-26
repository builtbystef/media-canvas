---
id: 2c1d0a
title: Install @tanstack/react-virtual from the npm registry
state: done
assignee: agent
priority: low
labels:
    - maintenance
depends_on:
    - p45jd2
created: 2026-08-25T19:33:59Z
updated: 2026-08-26T11:57:51Z
---

## What to build

p45jd2 added `@tanstack/react-virtual` as a `file:` dependency of `apps/web`, with the published 3.13.18 bits checked in under `apps/web/vendor/@tanstack`. That was the only way the implement session could add the library: the sandbox cannot reach `registry.npmjs.org`. The job view itself is done; this is only the install source.

## Acceptance criteria

- [ ] `apps/web` depends on `@tanstack/react-virtual` from the npm registry, not a `file:` path.
- [ ] `apps/web/vendor/` is gone.
- [ ] No other dependency is added or removed.
- [ ] The job view still virtualizes through `useVirtualizer`.

## Notes

**agent** — 2026-08-26T11:57:49Z

Switched `@tanstack/react-virtual` from the vendored `file:` path to the npm registry at 3.13.18, the same published bits p45jd2 had checked in. `apps/web/vendor/` is gone, and the vendor `dist/` gitignore exceptions went with it. No other dependency was added or removed. `JobView` still virtualizes through `useVirtualizer`.

**Seam.** The job-view test file: `useVirtualizer` resolves as a function, the web package specifier is a registry version (not `file:`), and `apps/web/vendor/` is absent.

**Decisions a reviewer should know.**

- *Exact 3.13.18, not a caret.* That is the version that was vendored and already running in the job view.
- *Lockfile hashes came from the registry metadata, not from `pnpm install`.* This sandbox still cannot reach `registry.npmjs.org` from the shell (`allowedDomains`). The integrity strings are the published `dist.integrity` values for `@tanstack/react-virtual@3.13.18` and `@tanstack/virtual-core@3.13.18`. A networked `pnpm install` should fetch those tarballs and match.

**Testing.** `vp check` green. 357 TS tests green (including the new install-source assertion). 152 api tests green via the sandbox unix sockets.
