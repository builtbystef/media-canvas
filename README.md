# Media Canvas

[![CI](https://github.com/builtbystef/media-canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/builtbystef/media-canvas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Media Canvas is a self-hosted web application for designing static visual assets and generating them at scale. Create a design in the visual editor, promote it to a Template, declare typed Variables, and produce PNG, JPEG, or PDF assets from the UI, REST API, or a CSV file.

> [!WARNING]
> Media Canvas is in early development. Features and APIs may change, and production deployments should be evaluated carefully.

## Features

- Visual editor for social posts, posters, ads, and website graphics
- Versioned JSON Design Documents with a shared validation and SVG compilation pipeline
- Reusable Templates with typed text, image, color, number, and Boolean Variables
- One-off generation and multi-row Generation Jobs through the UI or REST API
- CSV-based batch generation and downloadable output archives
- PNG, JPEG, and PDF output from a reproducible, Chromium-based render worker
- Workspace access control with Owner, Editor, and Viewer Roles
- Image uploads plus bundled and user-uploaded fonts
- Self-hosted Postgres, Redis, and S3-compatible object storage

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Using Media Canvas](#using-media-canvas)
- [Architecture](#architecture)
- [Development](#development)
- [Testing and quality](#testing-and-quality)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [License](#license)

## How it works

1. Create a design with the visual editor.
2. Promote the design to a Template.
3. Declare Variables and bind them to Element properties.
4. Supply one set of values for a single render or many Rows for a Generation Job.
5. Download an individual asset or the completed Job archive.

The editor and render worker use the same JSON-to-SVG compiler, keeping browser previews and generated output aligned. Final output is produced by a worker image with pinned Chromium, fonts, locale, viewport, and other rendering inputs.

## Quick start

### Prerequisites

- [Git](https://git-scm.com/)
- [Docker Engine](https://docs.docker.com/engine/) with the Compose plugin
- [Node.js](https://nodejs.org/) 24.18.0 or compatible Node 24 release
- [pnpm](https://pnpm.io/) 11.17.0
- [uv](https://docs.astral.sh/uv/) 0.12.3 (uv installs the pinned Python 3.14 toolchain)
- OpenSSL, for generating local secrets

### Install and run

```sh
git clone https://github.com/builtbystef/media-canvas.git
cd media-canvas

cp .env.example .env
```

Fill in every value marked `required` in `.env`. Generate secret values with:

```sh
openssl rand -hex 32
```

Then install dependencies and start the development infrastructure:

```sh
docker compose up -d --wait
uv sync --locked --all-packages
pnpm install --frozen-lockfile
pnpm --filter worker exec playwright-core install chromium
pnpm --filter api migrate
pnpm dev
```

Open:

- Web editor: <http://localhost:3000>
- API health check: <http://localhost:8000/api/health>

The default console Mailer writes one-time sign-in codes to `.dev/mailer.log`. The API also runs migrations when it starts, so the explicit migration command is safe to repeat.

## Using Media Canvas

Use the web editor for interactive work. For programmatic generation, use the REST API with a Workspace API Key. The committed [OpenAPI schema](apps/api/openapi.json) is the source for the generated TypeScript client in [`packages/api-client`](packages/api-client).

Terminology such as Design Document, Template, Variable, Generation Job, and Row has a precise project meaning. See the [glossary](docs/GLOSSARY.md) when integrating with the API.

## Architecture

Media Canvas is a pnpm and uv monorepo:

| Path                                         | Responsibility                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| [`apps/web`](apps/web)                       | Next.js visual editor and application UI                                         |
| [`apps/api`](apps/api)                       | FastAPI service, authentication, access control, persistence, and generation API |
| [`apps/worker`](apps/worker)                 | Node.js, BullMQ, Playwright, and pinned Chromium rendering                       |
| [`packages/core`](packages/core)             | Design Document schema, validation, substitution, migrations, and SVG compiler   |
| [`packages/fonts`](packages/fonts)           | Hash-verified bundled font set                                                   |
| [`packages/api-client`](packages/api-client) | Generated TypeScript client for the OpenAPI contract                             |
| [`tools/browser-smoke`](tools/browser-smoke) | On-demand browser smoke tests                                                    |

Postgres is the source of truth, Redis carries work signals, and Garage provides S3-compatible object storage. The API is the only Postgres writer. See [Architecture](docs/ARCHITECTURE.md) and the [architecture decision records](docs/adr/) for the complete module boundaries and rationale.

## Development

Run these commands from the repository root:

```sh
pnpm dev        # API :8000, web :3000, and render worker
pnpm check      # formatting, linting, and type checking
pnpm check:fix  # apply automatic formatting and lint fixes
pnpm test       # Vitest and pytest suites
pnpm build      # OpenAPI export, client generation, and application builds
pnpm run ci     # check, test, and build
```

Activate the repository's pre-commit hook once after cloning:

```sh
pnpm exec vp config
```

When an API endpoint changes, run `pnpm build` and commit the regenerated [`apps/api/openapi.json`](apps/api/openapi.json) and [`packages/api-client`](packages/api-client) output. CI rejects contract drift.

To create an Alembic migration after changing the database schema:

```sh
cd apps/api
uv run alembic revision --autogenerate -m "describe the change"
```

## Testing and quality

The standard validation commands are:

```sh
pnpm check
pnpm test
pnpm build
```

With the development stack running, exercise the real generation path with:

```sh
pnpm smoke
```

The browser smoke suite requires its own Chromium installation and the full Compose application:

```sh
pnpm smoke:browser:install
docker compose --profile app up -d --build --wait
pnpm smoke:browser
```

Focused editor and batch passes are also available as `pnpm smoke:editor` and `pnpm smoke:batch`. These smoke suites are intentionally separate from `pnpm test`.

Rendering fidelity is tested inside the pinned worker image:

```sh
pnpm --filter worker run image:build
pnpm --filter worker run image:check
```

See [`apps/worker/goldens/README.md`](apps/worker/goldens/README.md) before changing the rendering environment or golden baselines.

## Deployment

Run the complete application and infrastructure stack with:

```sh
cp .env.example .env
# Fill in all required values.
docker compose --profile app up -d --build
```

With `DOMAIN` empty, open `http://localhost` or the configured `HTTP_PORT`. Setting `DOMAIN` enables automatic HTTPS through Caddy.

For first deployment, upgrades, backups, restoration, health checks, and TLS configuration, follow the tested [deployment guide](docs/DEPLOYMENT.md).

## Documentation

| Document                                     | Contents                                        |
| -------------------------------------------- | ----------------------------------------------- |
| [Glossary](docs/GLOSSARY.md)                 | Canonical domain vocabulary                     |
| [Architecture](docs/ARCHITECTURE.md)         | Modules, ownership, and system seams            |
| [Architecture decisions](docs/adr/)          | Decisions that are difficult to reverse         |
| [Coding standards](docs/CODING_STANDARDS.md) | Project conventions beyond automated checks     |
| [Deployment](docs/DEPLOYMENT.md)             | Operations, backup, restore, and TLS procedures |
| [Tracker](docs/TRACKER.md)                   | Repository-local issue tracker workflow         |

## License

Media Canvas is available under the [MIT License](LICENSE).

Bundled fonts in [`packages/fonts`](packages/fonts) are licensed separately under the SIL Open Font License 1.1; each family directory includes its license text. Users are responsible for ensuring they have the rights to fonts uploaded to a Workspace.
