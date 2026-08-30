# Deployment

This guide runs Media Canvas on one Linux host with Docker Compose. The full procedure has been tested against a live stack. CI also checks that the Compose file is valid.

## Requirements

- A Linux host with Docker Engine and the `docker compose` plugin
- Git
- OpenSSL, used to create secrets
- Enough disk space to build the API, web, and Chromium worker images
- Port 80, or the port set in `HTTP_PORT`, for HTTP
- Ports 80 and 443 open to the internet when using automatic HTTPS

Postgres, Redis, and Garage publish development ports only on `127.0.0.1`. Caddy is the public entry point for the application.

## First deployment

Clone the repository:

```sh
git clone https://github.com/builtbystef/media-canvas.git
cd media-canvas
```

Create the environment file:

```sh
cp .env.example .env
```

Fill in every value marked `required`. Generate each secret with:

```sh
openssl rand -hex 32
```

The required values are:

- `POSTGRES_PASSWORD`
- `GARAGE_DEFAULT_ACCESS_KEY` — an identifier; it does not need to be secret
- `GARAGE_DEFAULT_SECRET_KEY`
- `GARAGE_RPC_SECRET` — exactly 32 bytes of hex
- `INTERNAL_API_TOKEN`

For a first local deployment, leave `DOMAIN` empty, keep `HTTP_PORT=80`, and use `MAILER=console`.

Build and start the full stack:

```sh
docker compose --profile app up -d --build
```

The API applies Alembic migrations before it starts serving. Check the stack with:

```sh
docker compose --profile app ps
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost/sign-in
curl -sS http://localhost/api/health
```

A healthy API returns a response like:

```json
{ "status": "ok", "database": { "connected": true, "schema_at_head": true } }
```

If `HTTP_PORT` is not 80, include it in the URL.

## Sign in for the first time

Open `/sign-in` at the public application URL. With `MAILER=console`, sign-in codes and Workspace Invites are written to the API log instead of being sent:

```sh
docker compose logs api | grep "sign-in code"
```

Enter the latest code in the sign-in page. A new User is then sent to the page for creating their first Workspace.

Do not use the console Mailer on a public instance. Anyone who can read the API logs can read sign-in codes.

## Configure mail

Set `MAILER` in `.env` to one of these values:

- `console` — write messages to the API log
- `resend` — send through Resend; also set `RESEND_API_KEY` and `EMAIL_FROM`
- `smtp` — send through SMTP; also set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`

Restart the API after changing mail settings:

```sh
docker compose --profile app up -d
```

The API stops at startup and names any setting required by the selected driver that is missing.

## Upgrade

Update the checkout and rebuild the application images:

```sh
git pull
docker compose --profile app up -d --build
```

Then check health:

```sh
curl -sS http://localhost/api/health
```

A healthy upgrade reports `connected: true` and `schema_at_head: true`. The API runs new database migrations during startup.

## Backup

A complete backup needs:

1. A Postgres dump.
2. A consistent copy of the Garage volume, which stores assets and generated files.
3. A protected copy of `.env`, which holds the credentials needed by the data.

The Garage copy requires a short storage outage. Stop Garage before copying it so its metadata and data blocks match.

```sh
mkdir -p /tmp/media-canvas-backups

docker compose exec -T postgres pg_dump -U media_canvas media_canvas \
  > /tmp/media-canvas-backups/postgres.sql

docker compose stop garage
docker compose cp garage:/var/lib/garage /tmp/media-canvas-backups/garage
cp .env /tmp/media-canvas-backups/env
```

Protect and move these files to durable backup storage. They contain secrets and user data.

Start Garage again when the backup is complete:

```sh
docker compose --profile app up -d
```

## Restore

> [!CAUTION]
> `docker compose --profile app down -v` deletes the current Postgres, Garage, and Caddy volumes. Check your backup before running it.

Keep the same environment values, especially the database and Garage credentials. Restore the saved environment file as `.env`, then remove the current stack and start an empty Postgres:

```sh
cp /tmp/media-canvas-backups/env .env
docker compose --profile app down -v
docker compose up -d postgres
docker compose exec -T postgres pg_isready -U media_canvas -d media_canvas
```

Restore Postgres:

```sh
docker compose exec -T postgres psql -U media_canvas -d media_canvas \
  < /tmp/media-canvas-backups/postgres.sql
```

Garage has no shell in its image, so use a temporary Alpine container to copy the backup into its Docker volume. First create and stop the empty Garage volume:

```sh
docker compose up -d garage
docker compose stop garage
docker volume ls --filter name=_garage-data
```

Use the volume name printed by the last command in place of `PROJECT_garage-data`:

```sh
docker run --rm \
  -v PROJECT_garage-data:/var/lib/garage \
  -v /tmp/media-canvas-backups/garage:/backup:ro \
  alpine:3.21 \
  sh -c 'rm -rf /var/lib/garage/meta /var/lib/garage/data && cp -a /backup/meta /backup/data /var/lib/garage/'
```

Start the full stack and check it:

```sh
docker compose --profile app up -d
curl -sS http://localhost/api/health
docker compose exec -T garage /garage status
```

Sign in and confirm that Workspaces, documents, assets, and Job outputs are present.

## HTTPS

Set `DOMAIN` in `.env` to a hostname whose DNS A or AAAA record points to the host. Keep `HTTP_PORT=80`. Ports 80 and 443 must be reachable from the internet.

Apply the change:

```sh
docker compose --profile app up -d --build
```

Caddy obtains and renews the certificate automatically. Its certificate data is stored in the `caddy-data` volume. HTTP is redirected to HTTPS after the certificate is active.

When `DOMAIN` is empty, Caddy serves plain HTTP on `HTTP_PORT` and does not enable TLS.

## Troubleshooting

Show service state and recent logs:

```sh
docker compose --profile app ps
docker compose logs --tail=200 api web worker caddy postgres redis garage
```

Useful checks:

```sh
curl -sS http://localhost/api/health
docker compose exec -T postgres pg_isready -U media_canvas -d media_canvas
docker compose exec -T redis redis-cli ping
docker compose exec -T garage /garage status
```

If the API reports `schema_at_head: false`, inspect the API logs for a migration error. If the API container exits during startup, also check its object-storage and Mailer settings.
