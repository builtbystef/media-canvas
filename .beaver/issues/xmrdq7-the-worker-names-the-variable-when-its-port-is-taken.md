---
id: xmrdq7
title: The worker names the variable when its port is taken
state: done
assignee: claude
priority: low
labels:
    - maintenance
parent: 0egsmf
created: 2026-08-19T01:59:35Z
updated: 2026-08-19T02:05:53Z
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

## Notes

**claude** — 2026-08-19T02:05:53Z

Built. The user decided to take this issue rather than close it unbuilt, against the case the body argues.

Completed work
- `explainListenFailure(failure, port)` in `apps/worker/src/internal-service.ts` returns a sentence for `EADDRINUSE` and `undefined` for everything else, so exactly one failure is paraphrased and the rest keep their stacks.
- `apps/worker/src/index.ts` now routes both startup failures through one `fail(message)`: a configuration problem (caught as `InternalServiceConfigError`) and a port it cannot have each print one line and exit 1. A listen failure with no explanation is re-thrown and surfaces whole; a non-config throw from `internalServiceConfig` is re-thrown too.
- Hand-verified against the collision that produced this issue: a second worker on port 4000 now prints `WORKER_INTERNAL_PORT: port 4000 is already in use — stop what is holding it, or name another port.` and exits 1, where it previously printed ~15 lines of Node internals.

Decisions a reviewer needs
- AC3 turned out to cover more than the port. The missing-credential path was also printing a stack trace — the message was there, wrapped in `InternalServiceConfigError: ...` plus five frames. "Reported the same way" therefore meant fixing both, so `readConfig` catches its own error type and prints the sentence alone. That is why the diff touches the configuration path as well as the listen path.
- The seam is the worker process itself: `apps/worker/src/startup.test.ts` spawns `src/index.ts` with `node` and reads its exit code and stderr, because an exit code is not observable in-process. Two of the five tests assert the absence of a stack trace (`stderr` is a single line, and holds no `    at ` frame), which is the criterion stated as it can be checked.
- The "any other listen failure" branch is unit-tested rather than driven through a real failure. The natural trigger is `EACCES` on a privileged port, but that depends on `net.ipv4.ip_unprivileged_port_start`, which is 1024 on this machine and commonly 0 inside a container — a test that passes here and fails in CI. The unit test over `explainListenFailure` is deterministic everywhere.
- TDD honesty: the port-conflict slice was written red first. The other two criteria were satisfied by the same edit — one `fail` path serves all three — so their tests were written afterwards and passed immediately, verification rather than red-green.

Checks: `pnpm check`, `pnpm test` (132 TS + 64 Python, five new) and `pnpm build` all pass. `apps/worker/environment.json` is untouched — the change is worker-side only, and the tuple's compiler hash covers core.
