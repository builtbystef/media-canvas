---
id: xmrdq7
title: The worker names the variable when its port is taken
state: todo
priority: low
labels:
    - maintenance
parent: 0egsmf
created: 2026-08-19T01:59:35Z
updated: 2026-08-19T01:59:35Z
---

## What to build

The worker's internal service reads `WORKER_INTERNAL_PORT` from the environment, and `internalServiceConfig` already promises that a bad environment fails at startup naming the variable at fault — that is why a missing `INTERNAL_API_TOKEN` produces a sentence a developer can act on. A port that is already in use breaks that promise: `listen` emits an unhandled `error` event, and the worker dies on Node's raw stack trace instead. The failure is a fact about the environment, so it should read like the other one.

Found while building gxwr7t, from a real collision: a second worker started on port 4000.

## Acceptance criteria

- [ ] A worker started when its configured port is already in use exits non-zero with a message naming `WORKER_INTERNAL_PORT` and the port, not a stack trace.
- [ ] Any other listen failure still surfaces rather than being swallowed.
- [ ] The startup path keeps its current shape: configuration problems are reported the same way, whether the environment names a bad value or the machine cannot honor a good one.

## The case against doing this

Worth weighing before taking it — no sibling in this repository handles a bind conflict specially:

- `apps/api` hard-codes `--port 8000` in its dev script and lets uvicorn report the collision itself; `apps/web` lets Next pick another port. Neither was considered a gap.
- Node's stack trace is not silent: it prints `EADDRINUSE`, the address, and the port. A developer who reads it learns what happened, so this buys wording, not information.
- In production the worker is one container with its own network namespace, where a collision cannot arise; the case is a development machine running a second worker.

The case for is consistency rather than capability: this service is the one whose port is configurable by environment, and it already answers a bad `INTERNAL_API_TOKEN` with a plain sentence, so a stack trace for the neighboring failure is the odd one out. If that is not worth a code path, close this issue rather than leaving it open.
