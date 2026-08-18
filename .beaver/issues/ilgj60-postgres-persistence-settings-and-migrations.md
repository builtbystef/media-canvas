---
id: ilgj60
title: Postgres persistence, settings, and migrations
state: done
assignee: claude
priority: high
parent: 88v6vg
created: 2026-08-15T06:21:33Z
updated: 2026-08-18T06:54:42Z
---

## What to build

The api can talk to Postgres and evolve its own schema. Configuration comes from the environment, migrations run before the app serves its first request, and a deployer can ask the running service whether the database is reachable and at the schema version the code expects. Nothing in the accounts surface can exist before this, and every test after it needs a real database to run against.

## Acceptance criteria

- [ ] Settings are read from the environment at startup. A missing required value fails startup with a message naming the variable, rather than a stack trace at the first request that needs it.
- [ ] The api owns its schema through migrations: applying them to an empty database produces exactly the schema the code expects, and adding a table later requires only a new migration — no manual database step is documented anywhere.
- [ ] The api applies pending migrations on startup, before serving.
- [ ] Health reports database connectivity and whether the schema is at head, and stays unauthenticated. Worked examples: database up and migrated → the response reports both healthy; database stopped → the response reports the database unreachable, and the process keeps running.
- [ ] Tests run against a real Postgres, each test starting from a clean database, through the project's ordinary test command.
- [ ] A developer who has only started the infra containers can run the api and its tests with no further setup.

## Notes

**claude** — 2026-08-18T06:54:42Z

Built. The api reads its settings from the environment, owns its schema through Alembic, migrates itself at startup, and reports both facts at /api/health. All checks green (pnpm run ci), tests against the compose Postgres.

What landed:
- `settings.py` — pydantic-settings `Settings`; `load_settings` turns a validation failure into a `SettingsError` naming the variable ("POSTGRES_PORT: input should be a valid integer"). `get_settings()` is called first thing in the lifespan, so a bad environment fails startup rather than the first request. Only POSTGRES_PASSWORD is required; host/port/user/db default to the compose stack.
- `db.py` — `Base` (the autogenerate target, ADR-0005) and the async engine factory.
- `migrator.py` + `migrations/` + `alembic.ini` — `upgrade_to_head` / `is_at_head` on a sync connection, reached from the app through `run_sync`. The script location resolves from the installed package, so neither the working directory nor alembic.ini matters at runtime; alembic.ini exists for `uv run alembic revision --autogenerate`, which is verified to work and chain from the baseline.
- `0001_baseline` creates nothing. Tables belong to the issues that introduce them (sycz8o, sazdn4, k7wegl, t3n0fj); the baseline exists so the schema version and the chain's first parent are there from the first boot.
- `main.py` — lifespan migrates under a Postgres advisory lock (two api processes starting together would otherwise run the same pending migrations twice), then serves.
- `health.py` — `check_database` returns `{connected, schema_at_head}`; the route wraps it as `{status: ok|degraded, database: {...}}`.
- CI: the api job now writes a placeholder .env from .env.example and starts the compose Postgres before pytest. README documents that migrations are automatic and that adding a table is adding a migration — no manual database step anywhere.

Decisions:
- SQLAlchemy 2.0 async + psycopg3. One driver serves both engine kinds (async for the app, sync for Alembic), and async is the shape every later route will want.
- Health answers 200 in every case and puts the truth in the body. A probe that disappears when the database does cannot report what is wrong, and the spec pins /api/health at 200.
- An unreachable database at startup logs and serves anyway, so health can be asked what happened. A migration that fails against a reachable database still stops startup — that is a broken deployment, not a wait. Verified for real: with the api running, `docker compose stop postgres` → `{"status":"degraded","database":{"connected":false,"schema_at_head":false}}`, process alive, and `ok` again after `start`.
- New production dependencies, with reasons (per CODING_STANDARDS): sqlalchemy and alembic (the ADR-0005 pairing), psycopg[binary] (the driver), pydantic-settings (finds the repository-root .env by walking up, so a host-run api and its tests need nothing exported, and its typed validation is what names the offending variable — it also carries the conditional requirements 92zwes and 22bvk7 will add).
- `.env.example` is unchanged: the settings it does not name have defaults, and the app profile (1gffor) sets POSTGRES_HOST on the api container.

Test seams: the public HTTP API for health and for startup migration (the spec's seam 1), plus the settings loader and the migrator directly for what HTTP cannot observe. Tests use their own database, `media_canvas_test`, recreated once per session and truncated after each test; `empty_database` gives migration tests a database with not even a schema version. A Postgres that is not running fails with an instruction to start the containers, never a skip.

For a reviewer: the metadata-vs-migrations guard (`compare_metadata` == []) is live but has nothing to compare until the first table lands; env.py carries the warning that a model module nobody imports is invisible to autogenerate.
