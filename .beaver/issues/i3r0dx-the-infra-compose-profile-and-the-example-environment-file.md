---
id: i3r0dx
title: The infra compose profile and the example environment file
state: todo
priority: high
parent: 88v6vg
created: 2026-08-15T06:21:37Z
updated: 2026-08-15T06:21:37Z
---

## What to build

One compose command brings up the infrastructure the product runs on — Postgres, Redis, and object storage — pinned, healthchecked, and reachable only from the host that started them. A newcomer copies one example file, fills in the secrets it names, and has a working environment; the same file is what a deployer fills in on a server later.

## Acceptance criteria

- [ ] The default compose profile brings up Postgres 17, Redis 8, and a pinned MinIO, with named volumes for everything that must survive a restart.
- [ ] Every infra service declares a healthcheck, and every published port binds to localhost only.
- [ ] The committed example environment file lists every variable the product reads, marks each required or optional, gives the default for the optional ones, and states how to generate the secret values.
- [ ] The real environment file is ignored by git, and copying the example plus filling in the required values is the entire setup.
- [ ] CI checks that the compose file is valid. Worked example: a syntax error, or a reference to a variable the example file does not define, fails CI.
- [ ] Existing development behavior is unchanged: infra up, then the ordinary dev command, still works.
