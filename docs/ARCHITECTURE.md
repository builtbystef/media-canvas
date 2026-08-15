# Architecture

The modules of this system, and the seams between them. Update this file when the shape changes. Audits compare it with reality.

## Modules

A pnpm + uv monorepo. TS projects live under `apps/*` and `packages/*` (pnpm workspace); Python projects register in the root `pyproject.toml` (uv workspace). Shared TypeScript compiler presets live in `tsconfig/`.

- **`apps/web`** — the Next.js editor. Renders the compiled document in the browser; talks to the backend only through `@media-canvas/api-client`.
- **`apps/api`** — FastAPI. Owns the Postgres schema and its Alembic migrations, and is the only Postgres writer (ADR-0005). Produces BullMQ tasks (ADR-0004). Never interprets document internals (ADR-0003).
- **`apps/worker`** — the render worker: Node + Playwright driving pinned headless Chromium (ADR-0002). Consumes per-Row BullMQ tasks and reports results through an internal api endpoint; holds no database client.
- **`packages/core`** (`@media-canvas/core`) — the shared TypeScript core (ADR-0003): Design Document schema types, validation, value substitution, and the JSON→SVG compiler. Imported by `apps/web` and `apps/worker`; the single place render fidelity is defined.
- **`packages/api-client`** (`@media-canvas/api-client`) — TypeScript client generated (`@hey-api/openapi-ts`) from the committed `apps/api/openapi.json`.

## Seams

- **web ↔ api**: the OpenAPI contract. `apps/api`'s build dumps `openapi.json`; `packages/api-client`'s build regenerates the typed client; both are committed, and CI's contract job fails on drift.
- **api ↔ worker**: Redis/BullMQ carries the work signal only; Postgres holds the state (ADR-0004). Results flow back over the internal api endpoint (ADR-0005).
- **web & worker ↔ core**: both sides render exclusively through `@media-canvas/core`, so editor preview and worker output cannot drift (ADR-0002/0003).
