# Deployment

How to put Media Canvas on a box and keep it there. Every command below was run
against a live Compose stack; the guide records nothing that was not.

There is no automated test for deployment. This document is the procedure.

## Prerequisites

- A Linux host with [Docker Engine](https://docs.docker.com/engine/) and the
  Compose plugin (`docker compose`). This session used Docker Engine 29.7.2 and
  Compose v5.4.0 on x86_64.
- Git, to clone the repository.
- `openssl`, to generate the secrets `.env.example` asks for.
- Disk for the first image build. The pinned render worker image was 2.1 GB,
  the web image 2.1 GB, the api image 647 MB, plus Postgres, Redis, Garage, and
  Caddy.
- Published ports: Compose maps HTTP on `HTTP_PORT` (default 80) and always
  maps 443. Postgres, Redis, and Garage also bind their development ports on
  localhost (5432, 6379, 3900).
- For HTTPS: a DNS A or AAAA record for the host, and ports 80 and 443
  reachable from the internet. See [TLS](#tls).

## First deploy

Clone the repository onto the host and enter it.

```sh
git clone https://github.com/builtbystef/media-canvas.git
cd media-canvas
```

Copy the environment file and fill every value `.env.example` marks required:

```sh
cp .env.example .env
openssl rand -hex 32
```

Run `openssl rand -hex 32` once per required secret and paste the output into
`.env`:

- `POSTGRES_PASSWORD`
- `GARAGE_DEFAULT_SECRET_KEY` (Garage rejects a secret shorter than 16
  characters)
- `GARAGE_RPC_SECRET` (32 bytes of hex — that openssl command is exactly that)
- `INTERNAL_API_TOKEN`

`GARAGE_DEFAULT_ACCESS_KEY` is an identifier; this session generated it with
`openssl rand -hex 16`. Leave `DOMAIN` empty, `HTTP_PORT=80`, and
`MAILER=console` as the example already has them.

Bring the stack up from the repository root:

```sh
docker compose --profile app up -d --build
```

The first build compiles the api, the web app, and the pinned Chromium worker.
This session's build finished in a few minutes; later `up --build` runs reused
the cache.

Wait until the origin answers. This session's first request after `up` already
did:

```sh
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost/sign-in
curl -sS http://localhost/api/health
```

`/sign-in` returned 200 with the Sign in page (title "Sign in — Media Canvas",
an Email address field, and a "Send me a code" button). `/api/health` returned:

```json
{ "status": "ok", "database": { "connected": true, "schema_at_head": true } }
```

`schema_at_head` is true once the api has applied its Alembic migrations. The
api does that on startup, before it serves.

### Sign in and create a Workspace

Open `http://localhost/sign-in`. The default Mailer is `console`: it prints the
code to the api log instead of sending mail.

This session signed in as `deployer@example.com`. Request a code (the page's
form posts the same body):

```sh
curl -sS -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost/api/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"email":"deployer@example.com"}'
```

That returned 204. The code is on a log line of the form
`sign-in code for deployer@example.com: 450615`:

```sh
docker compose logs api | grep "sign-in code"
```

Verify it (the page's form posts the same body). Save the session cookie.
Substitute the six-digit code from that log line — the one above was spent by
this session:

```sh
curl -sS -o /dev/null -w "%{http_code}\n" \
  -c cookies -b cookies \
  -X POST http://localhost/api/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"deployer@example.com","code":"450615"}'
```

That returned 204 and set `media_canvas_session` (HttpOnly, Path=/, SameSite=Lax,
Max-Age=2592000). `GET /api/v1/me` then returned the User with an empty
memberships list. `GET /workspaces/new` returned 200 with "Create your
workspace" and a Workspace name field — first sign-in lands there.

Create the Workspace (the page's form posts the same body):

```sh
curl -sS -c cookies -b cookies \
  -X POST http://localhost/api/v1/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name":"Deploy Guide"}'
```

That returned 201 `{"id":"…","name":"Deploy Guide"}`. `GET /api/v1/me` then
listed that Workspace with role `owner`. `GET /` returned 200 showing Documents
and the Workspace name.

## Upgrade

From the same clone:

```sh
git pull
docker compose --profile app up -d --build
```

This session's `git pull` reported "Already up to date." Compose rebuilt from
cache, recreated Caddy, and left the other services running. Immediately
afterwards:

```sh
curl -sS http://localhost/api/health
```

again returned `schema_at_head: true`. `docker compose exec -T postgres psql -U
media_canvas -d media_canvas -c "SELECT version_num FROM alembic_version;"`
printed `0009_api_keys`. The session cookie still authenticated, and `/me`
still listed the Deploy Guide Workspace.

## Backup

Postgres via `pg_dump`, and a copy of the Garage volume taken with that
container stopped so the LMDB metadata under `meta/` matches the blocks under
`data/`. This session wrote both artifacts under `/tmp/media-canvas-backups`.

```sh
mkdir -p /tmp/media-canvas-backups

docker compose exec -T postgres pg_dump -U media_canvas media_canvas \
  > /tmp/media-canvas-backups/postgres.sql

docker compose stop garage
docker compose cp garage:/var/lib/garage /tmp/media-canvas-backups/garage
```

The dump was a Postgres 17 plain-SQL file and contained the Workspace row. The
Garage copy contained both `meta/` (including `db.lmdb`) and `data/`. `-T` keeps
`exec` from allocating a TTY, which this session did not have.

Garage is left stopped. The restore below starts from an empty stack; to keep
serving after a backup only, bring the stack up again with the same
`docker compose --profile app up -d` command used in restore.

## Restore

Restore those artifacts onto an empty stack. `down -v` deletes the named
volumes — the running instance's data is gone after this.

Keep the same `.env`. This session did not try a different one.

```sh
docker compose --profile app down -v

docker compose up -d postgres
```

Wait until Postgres accepts connections:

```sh
docker compose exec -T postgres pg_isready -U media_canvas -d media_canvas
```

Load the dump into the empty database the image just initialized:

```sh
docker compose exec -T postgres psql -U media_canvas -d media_canvas \
  < /tmp/media-canvas-backups/postgres.sql
```

`SELECT id, name FROM workspaces;` then returned the Deploy Guide row, and
`alembic_version` was again `0009_api_keys`.

Garage's image is a single static binary with no shell, so the volume is
restored from an Alpine container. Compose names the volume `garage-data`;
Docker prefixes the project (the directory name by default). This session's
directory was `media-canvas-deploy`, and `docker volume ls` listed
`media-canvas-deploy_garage-data`. `docker compose config --volumes` listed
the unprefixed names `garage-data` and `postgres-data`.

Start Garage once so Compose creates the volume, stop it, replace `meta/` and
`data/`, then bring the whole stack up:

```sh
docker compose up -d garage
docker compose stop garage

docker run --rm \
  -v media-canvas-deploy_garage-data:/var/lib/garage \
  -v /tmp/media-canvas-backups/garage:/backup:ro \
  alpine:3.21 \
  sh -c 'rm -rf /var/lib/garage/meta /var/lib/garage/data && cp -a /backup/meta /backup/data /var/lib/garage/'

docker compose --profile app up -d
```

Substitute the `_garage-data` volume `docker volume ls` printed for this
project. `/api/health` returned 502 for one request while the api was still
starting, then 200 with `schema_at_head: true`.

Sign in the same way as first deploy. A new code arrived in
`docker compose logs api`. After verify, `/me` listed the same User and the
same Deploy Guide Workspace (`cf8486e4-d95f-40ff-a976-c993d3b5ab22`), and
`GET /` showed Documents and that name. `docker compose exec -T garage /garage
status` reported a healthy node.

## TLS

HTTPS is one variable. Set `DOMAIN` in `.env` to the hostname whose DNS A or
AAAA record points at this host, and leave `HTTP_PORT` at `80`. Ports 80 and
443 must be reachable from the internet: 80 is the Let's Encrypt challenge
(and then a redirect), 443 is HTTPS.

Bring the stack up with the same command as first deploy:

```sh
docker compose --profile app up -d --build
```

Caddy's site address is `${DOMAIN}` when that variable is set, and
`http://:80` when it is empty. This session confirmed the empty case on the
live stack: `SITE_ADDRESS=http://:80`, Caddy listened only on port 80, logged
"no automatic HTTPS will be applied to this server", and a TLS handshake to
the mapped port 443 failed. `docker compose --profile app config` with
`DOMAIN=canvas.example.com` interpolated `SITE_ADDRESS: canvas.example.com`
and still published 443.

The first time certificates are issued, Caddy obtains them itself (Let's
Encrypt) and stores them in the `caddy-data` volume, which survives `down`
and `up`. HTTP on 80 is then the challenge and a redirect to HTTPS; there are
no certificate files to copy in by hand. This session did not obtain a
certificate — that step needs a public DNS name and reachable ports 80 and
443, which this host did not provide.
