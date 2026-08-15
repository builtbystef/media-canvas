---
id: ilgj60
title: Postgres persistence, settings, and migrations
state: todo
priority: high
parent: 88v6vg
created: 2026-08-15T06:21:33Z
updated: 2026-08-15T06:21:33Z
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
