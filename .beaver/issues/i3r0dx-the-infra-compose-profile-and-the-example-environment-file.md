---
id: i3r0dx
title: The infra compose profile and the example environment file
state: done
assignee: claude
priority: high
depends_on:
    - jl1ew8
parent: 88v6vg
created: 2026-08-15T06:21:37Z
updated: 2026-08-18T06:32:29Z
---

## What to build

One compose command brings up the infrastructure the product runs on — Postgres, Redis, and object storage — pinned, healthchecked, and reachable only from the host that started them. A newcomer copies one example file, fills in the secrets it names, and has a working environment; the same file is what a deployer fills in on a server later.

## Acceptance criteria

- [ ] The default compose profile brings up Postgres 17, Redis 8, and a pinned Garage (`dxflrs/garage:v2.3.0`), with named volumes for everything that must survive a restart. Garage additionally needs its committed config file mounted read-only at `/etc/garage.toml`, and one volume at `/var/lib/garage` covers both its metadata and its data.
- [ ] Every infra service declares a healthcheck, and every published port binds to localhost only. Worked example for Garage: its image is a single static binary with no shell, so a healthcheck must be exec form — `["CMD", "/garage", "status"]` exits 0 once the node serves; the alternative is the unauthenticated `GET /health` on the admin port, which then has to be published.
- [ ] The committed example environment file lists every variable the product reads, marks each required or optional, gives the default for the optional ones, and states how to generate the secret values.
- [ ] The real environment file is ignored by git, and copying the example plus filling in the required values is the entire setup.
- [ ] CI checks that the compose file is valid. Worked example: a syntax error, or a reference to a variable the example file does not define, fails CI.
- [ ] Existing development behavior is unchanged: infra up, then the ordinary dev command, still works.

## Notes

**claude** — 2026-08-18T06:32:29Z

Landed: the infra compose profile (`docker-compose.yml`), the committed `.env.example`, a `compose` CI job, and the `cp .env.example .env` step in the README.

Compose: Postgres 17, Redis 8 and `dxflrs/garage:v2.3.0` all declare a healthcheck and publish to 127.0.0.1 only. Garage keeps its read-only `/etc/garage.toml` mount and the single `/var/lib/garage` volume; its healthcheck is exec form (`["CMD", "/garage", "status"]`) because the image has no shell, so the admin port stays unpublished. Redis gets no volume — ADR-0004 makes it a pure work signal, reconcilable from Postgres.

Decisions:

- Required variables are referenced as `${VAR:?message}` (fails when unset *or* empty), so a copied-but-unfilled `.env` fails at `docker compose` time naming the variable, instead of a container failing later. Verified: `docker compose --env-file .env.example config` refuses, naming POSTGRES_PASSWORD.
- CI writes a placeholder-filled copy of `.env.example` (`sed` over the empty values) and runs `docker compose --env-file … --profile "*" config --quiet`. The fill is needed because the example's required values are empty; a compose reference to a variable the example does not define stays unset and fails. Both worked examples were run locally: an undefined variable reference and a YAML syntax error each exit 1. `--profile "*"` is there so the check covers the app profile's services the moment 1gffor adds them.
- `.env.example` lists only what is read today: POSTGRES_PASSWORD and the three GARAGE_* values. The spec's fuller block (DOMAIN, HTTP_PORT, PUBLIC_URL, INTERNAL_API_TOKEN, MAILER and the mail settings) belongs to the issues that make those values read — 1gffor, 22bvk7, 4dpprd — and the CI check forces each into the example as it lands. There are no optional variables yet, so no defaults are documented. `apps/web`'s API_URL is deliberately absent: `next dev` reads `apps/web/.env*`, not the root `.env`, and the web container's environment is 1gffor's.

Verification (no test seam here, per the spec): an isolated compose project with its own volumes and alternate loopback ports, brought up from a filled copy of `.env.example` and removed afterwards. All three services reached healthy, every published port bound 127.0.0.1, Postgres authenticated with the `.env` password, and `garage key info` showed the access key minted from the GARAGE_DEFAULT_* pair. `vp check`, `vp run -r check`, `vp test` and `vp run -r test` all pass.

Note for whoever runs the dev stack next: the existing `media-canvas_postgres-data` and `media-canvas_garage-data` volumes were initialized with the previously hardcoded credentials, and neither service re-reads those values on an existing volume. The values in a new `.env` take effect after `docker compose down -v`.
