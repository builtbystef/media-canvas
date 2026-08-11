# 0005 — FastAPI owns the database schema; the worker never writes Postgres

**Context.** Both FastAPI and the Node render worker need Row state changed: FastAPI creates it, the worker produces results. Two runtimes writing one Postgres schema would need duplicated model definitions kept in sync with Alembic migrations.

**Decision.** FastAPI owns the schema and its Alembic migrations, and is the only Postgres writer. The worker reports row results through a small internal FastAPI endpoint and holds no database client.

**Reason.** One runtime owning DB writes removes the drift risk of two ORMs describing the same tables — the same reasoning that gave the shared TypeScript core (ADR-0003) applies to the relational schema. The accepted cost is an internal API hop per row result, negligible against ~166 ms renders.
