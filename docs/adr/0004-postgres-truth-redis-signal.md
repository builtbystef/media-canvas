# 0004 — Postgres is the source of truth; Redis/BullMQ carries only the work signal

**Context.** Generation Jobs span two runtimes: FastAPI creates jobs and serves the polling endpoint, Node render workers execute rows (ADR-0003). Both the job state and the queue could live in either Postgres or Redis.

**Decision.** Postgres holds every Job and Row record — states, per-row statuses, progress counts. Redis via BullMQ (official Python producer in FastAPI, Node consumer in the worker) carries only the work signal: one BullMQ task per Row, `attempts: 2` implementing the contract's single automatic retry on transient errors.

**Reason.** The polling endpoint needs job state in the database anyway; making Redis a second authority would mean two systems agreeing about the same state. With Redis as pure signal, a worker crash leaves Postgres reconcilable and Redis flushable without losing job history. Per-Row tasks make retry, concurrency (8 pages per browser), and cancel (skip unrendered rows) queue primitives instead of hand-rolled loops.
