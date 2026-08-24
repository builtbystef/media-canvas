## Checks

One command vocabulary covers both languages: root pnpm scripts fan out through Vite+ (`vp`) to every workspace package (TypeScript directly, Python via ruff/ty/pytest under `uv run`). One failing package fails the command.

- Format: `pnpm check` (fix with `pnpm check:fix`)
- Lint: `pnpm check` (fix with `pnpm check:fix`)
- Typecheck: `pnpm check`
- Test: `pnpm test`

`pnpm check` deliberately runs format + lint + typecheck as one pass. After changing an endpoint, `pnpm build` regenerates the OpenAPI schema and typed client — commit them (CI fails on drift). `pnpm run ci` is check + test + build.

## Reaching the dev stack from inside the sandbox

Sandboxed agent sessions (Claude Code, Pi) run in an isolated network namespace: the stack's loopback ports (Postgres 5432, Redis 6379, Garage 3900) are unreachable from sandboxed commands, and no config re-opens them. The stack publishes two other doors:

- Postgres and Redis answer on unix sockets under `.dev/run/`: `psql "host=$PWD/.dev/run/pg user=media_canvas dbname=media_canvas"` and `redis-cli -s .dev/run/redis/redis.sock`. The same paths work in connection URLs (`?host=` for Postgres, `unix://` for Redis).
- Garage answers through the sandbox's egress proxy at `http://stack.local:3900`. `stack.local` is an `/etc/hosts` alias for 127.0.0.1; unlike `localhost` it is not on the sandbox's `NO_PROXY` list, so proxy-honouring clients (curl, httpx, boto3) reach it.

## Project docs & tracker

### Domain glossary

`docs/GLOSSARY.md` — the project's terms. Use its vocabulary in code, tests, specs, and issues. The format rules are at the top of the file.

### Coding standards

`docs/CODING_STANDARDS.md` — the conventions beyond the linter. Reviews check diffs against it.

### Architecture & decisions

`docs/ARCHITECTURE.md` — the modules and the seams. `docs/adr/` — decisions already made (the format is in `docs/adr/README.md`). Do not debate them again.

### Issue tracker

`docs/TRACKER.md` — how to use this project's issue tracker.

## Nested agent instructions

`apps/web/AGENTS.md` carries a block that `next dev` writes and re-writes on its own. It is committed so the dev server leaves a clean tree; this root file stays authoritative wherever the two disagree. A Next upgrade may rewrite the block — review that diff like any other.
