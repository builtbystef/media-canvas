# Media Canvas

A web app for designing static visual assets (Instagram posts, posters, ads, website graphics) and generating them in bulk.

You design in a visual editor. The design is saved as a versioned JSON **Design Document**. Any design can be promoted to a **Template**, which declares typed **Variables** (text, images, colors, numbers). Assets are then generated from that template — one-off in the web editor, in bulk through the REST API, or from an uploaded CSV.

## Status

Early build. The monorepo scaffold and checks are in place; the specs, decisions, and tracker drive what lands next. The stack:

- **Frontend / editor** — Next.js (`apps/web`), rendering the compiled SVG inline
- **Backend** — FastAPI (`apps/api`); owns the database schema and is the only Postgres writer
- **Render worker** — Node + Playwright driving a pinned headless Chromium, in TypeScript (`apps/worker`)
- **Shared core** — one TypeScript package (`packages/core`) with the Design Document schema, validation, variable substitution, and the JSON→SVG compiler, used by both the editor and the worker
- **Bundled fonts** — nine SIL OFL families vendored with a hash-verified manifest (`packages/fonts`)
- **Infrastructure** — Postgres (source of truth), Redis/BullMQ (work signal only), Garage (object storage, S3 API)

## Development

Requires Node ≥ 24 (pinned in `.node-version`) and [uv](https://docs.astral.sh/uv) (fetches the pinned Python automatically).

```sh
pnpm install        # TS dependencies
uv sync             # Python venv + dependencies
vp config           # once after cloning: activates the pre-commit hook

cp .env.example .env  # then fill in the values it marks required
docker compose up -d  # Postgres + Redis + Garage
pnpm dev            # FastAPI :8000 + Next.js :3000 + render worker
pnpm check          # format + lint + typecheck, both languages
pnpm check:fix
pnpm test           # Vitest + pytest
pnpm build          # export schema → generate client → next build
pnpm run ci         # everything CI runs
```

Those containers are the whole setup: the api reads its configuration from
`.env` and applies its own migrations when it starts, so a fresh database
never needs a step of its own. `pnpm test` runs the api's tests against that
same Postgres, in a database of their own that is recreated for each run.

## Run the whole application with Compose

After copying `.env.example` to `.env` and filling in its required values, one
command builds and starts the application and its infrastructure:

```sh
docker compose --profile app up -d --build
```

With `DOMAIN` empty, open `http://localhost` (or the configured `HTTP_PORT`).
Set `DOMAIN` and run the same command again to serve that domain over HTTPS;
Caddy obtains and renews the certificates.

Renders happen in one pinned image and nowhere else (ADR-0002):

```sh
pnpm --filter worker run image:build        # build the pinned render worker image
pnpm --filter worker run image:check        # smoke, environment, render, and golden checks, inside it
pnpm --filter worker run goldens:bake       # write golden baselines, inside the image only
pnpm --filter worker run environment:write  # rewrite the environment tuple
```

`apps/worker/environment.json` is that image's environment tuple — the base
image, the Playwright package with the browser builds paired to it, the font
set and its configuration, the page's viewport, scale, locale, timezone and
color scheme, and the compiler and schema versions. Golden baselines are bound
to it, so a change to the Dockerfile, to Playwright, to the bundled fonts or to
the compiler is a change of environment: rewrite the tuple with the command
above and re-bake the baselines it invalidates. The re-bake policy — whole
suite only after a deliberate tuple change, reviewed with the old and new
tuples; an intended rendering change updates only the fixtures it affects — is
in [`apps/worker/goldens/README.md`](apps/worker/goldens/README.md).

## Browser smoke suite

A small Playwright suite covers only behavior that needs a DOM, browser history,
or the cookie jar. It runs on demand, not in CI or as part of `pnpm test`,
because it requires the full Compose stack and reads one-time codes from the
console Mailer's api log. Its Playwright installation is separate from the
render worker's fidelity-pinned browser.

Prepare its Chromium once, start a console-Mailer stack at the default HTTP
origin, and run it from another terminal:

```sh
pnpm smoke:browser:install
docker compose --profile app up -d --build --wait
pnpm smoke:browser
```

Set `SMOKE_BASE_URL` when Caddy is not at `http://localhost`, for example
`SMOKE_BASE_URL=http://localhost:8080 pnpm smoke:browser`. A sandboxed runner
can route the `stack.local` alias through its egress proxy with
`SMOKE_BASE_URL=http://stack.local SMOKE_PROXY="$HTTPS_PROXY"`. The runner must also
be able to invoke `docker compose logs api`, which is how it observes the code
and the `/me` request made after a history restore. Keep browser scenarios in
`tools/browser-smoke/browser-smoke.e2e.ts`; behavior a pure module can answer stays in
that module's Vitest suite instead.

Adding a table is adding a migration:

```sh
cd apps/api
uv run alembic revision --autogenerate -m "add the widgets table"
```

## Documentation

| Document                                               | What it holds                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md)                 | The project's vocabulary — Design Document, Element, Template, Variable, and the rest |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)         | The modules and the seams between them                                                |
| [`docs/adr/`](docs/adr/)                               | Decisions that are hard to reverse, one file each                                     |
| [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) | Conventions beyond the linter                                                         |
| [`docs/TRACKER.md`](docs/TRACKER.md)                   | How the issue tracker is used                                                         |

## License

MIT — see [LICENSE](LICENSE).

The bundled fonts in `packages/fonts` are not covered by that license: every
one of them is licensed under the SIL Open Font License 1.1, and each family
directory carries the license text it shipped with. A font uploaded to a
Workspace is the uploader's responsibility — the app does not check whether
they hold the rights to it.
