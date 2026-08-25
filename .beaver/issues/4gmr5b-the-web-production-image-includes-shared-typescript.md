---
id: 4gmr5b
title: The web production image includes shared TypeScript configuration
state: done
assignee: agent
priority: high
labels:
    - bug
created: 2026-08-25T15:07:41Z
updated: 2026-08-25T15:25:35Z
---

## Problem

The `app` Compose profile cannot build the web image. `apps/web/tsconfig.json` extends `../../tsconfig/browser.json`, but `apps/web/Dockerfile` does not copy the root `tsconfig/` directory into its build stage, so `next build` fails before the stack starts.

## Acceptance criteria

- [ ] The web Dockerfile includes the shared TypeScript configuration before running the web build.
- [ ] `docker compose --profile app up -d --build --wait` gets past the reported tsconfig resolution failure.

## Notes

**agent** — 2026-08-25T15:25:35Z

The web image now copies tsconfig/ before next build. docker compose --profile app up -d --build --wait got past the reported extends resolution failure; the stack came up.
