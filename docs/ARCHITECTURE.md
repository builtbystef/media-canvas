# Architecture

This file describes the main modules and the boundaries between them. Update it when the system changes.

## Modules

Media Canvas is a pnpm and uv monorepo. TypeScript projects are in `apps/`, `packages/`, and `tools/`. The Python API is registered in the root `pyproject.toml`. Shared TypeScript settings are in `tsconfig/`.

- **`apps/web`** — The Next.js application and visual editor. It renders SVG compiled by `@media-canvas/core` and uses `@media-canvas/api-client` for API calls. The UI uses Tailwind CSS v4 and shadcn/ui components built on Base UI. Theme tokens and system light/dark styles are in `app/globals.css`; owned component source is in `components/ui`.
- **`apps/api`** — The FastAPI service. It owns the Postgres schema, Alembic migrations, authentication, Workspaces, access control, documents, assets, and Generation Jobs. It is the only Postgres writer (ADR-0005). It treats Design Document JSON as opaque and asks the worker to validate or render it (ADR-0003). Client asset and output downloads pass through the API; clients never receive object-storage credentials or presigned URLs.
- **`apps/worker`** — The Node render worker. It uses Playwright and pinned Chromium (ADR-0002). It validates Design Documents, compiles them through `@media-canvas/core`, renders PNG, JPEG, or PDF files, and writes Job outputs to object storage. It consumes one BullMQ task per Row and reports results to the API. It has no database client. Its internal HTTP service also handles synchronous renders and font inspection. Both render paths share a pool of eight browser pages.
- **`packages/core`** (`@media-canvas/core`) — The shared Design Document types, validation, forward-only migrations, Variable value handling, and JSON-to-SVG compiler. The web app and worker both use it, so render rules have one implementation.
- **`packages/fonts`** (`@media-canvas/fonts`) — Nine bundled SIL OFL font families and a checked manifest. The manifest identifies each Font Asset by the SHA-256 hash of its bytes. The compiler, worker, tests, and Workspace setup all read this manifest.
- **`packages/api-client`** (`@media-canvas/api-client`) — The TypeScript client generated from `apps/api/openapi.json` with `@hey-api/openapi-ts`.
- **`tools/browser-smoke`** — Playwright smoke tests for behavior that needs a real browser and the full application stack.
- **Root Compose stack** — The default profile starts Postgres, Redis, and Garage for development. The `app` profile also starts the API, web app, worker, and Caddy. Caddy sends `/api` and `/assets` to the API and all other paths to the web app. Setting `DOMAIN` enables automatic HTTPS.

## Boundaries

- **Web ↔ API** — The OpenAPI contract. The API build updates `apps/api/openapi.json`, then the API client build regenerates `packages/api-client`. Both are committed. CI fails if they drift.
- **API ↔ worker** — Redis carries BullMQ work signals; Postgres holds Job and Row state (ADR-0004). The API writes BullMQ-compatible tasks directly to Redis. The worker fetches Job data and reports results through internal API routes protected by a shared token (ADR-0005).
- **Web and worker ↔ core** — Both use `@media-canvas/core` for document rules and compilation (ADR-0002 and ADR-0003).
- **API and worker ↔ object storage** — Garage, or another S3-compatible service, stores asset bytes and render outputs under Workspace-specific paths. The API creates buckets, writes and serves assets, and serves outputs. The worker reads held assets through the API and writes completed Job outputs directly to storage.
- **API ↔ mail** — One Mailer interface sends OTP codes and Workspace Invites. `MAILER` selects the console, Resend, or SMTP driver. Tests use a recording fake.
- **Browser smoke tests ↔ application** — `tools/browser-smoke` uses its own Chromium installation against the full stack. These tests cover cookies, navigation, browser history, and DOM gestures. They run on demand, not in CI or `pnpm test`.
