# Media Canvas

A web app for designing static visual assets (Instagram posts, posters, ads, website graphics) and generating them in bulk.

You design in a visual editor. The design is saved as a versioned JSON **Design Document**. Any design can be promoted to a **Template**, which declares typed **Variables** (text, images, colors, numbers). Assets are then generated from that template — one-off in the web editor, in bulk through the REST API, or from an uploaded CSV.

## Status

Early build. The monorepo scaffold and checks are in place; the specs, decisions, and tracker drive what lands next. The stack:

- **Frontend / editor** — Next.js (`apps/web`), rendering the compiled SVG inline
- **Backend** — FastAPI (`apps/api`); owns the database schema and is the only Postgres writer
- **Render worker** — Node + Playwright driving a pinned headless Chromium, in TypeScript (`apps/worker`)
- **Shared core** — one TypeScript package (`packages/core`) with the Design Document schema, validation, variable substitution, and the JSON→SVG compiler, used by both the editor and the worker
- **Infrastructure** — Postgres (source of truth), Redis/BullMQ (work signal only), Garage (object storage, S3 API)

## Development

Requires Node ≥ 24 (pinned in `.node-version`) and [uv](https://docs.astral.sh/uv) (fetches the pinned Python automatically).

```sh
pnpm install        # TS dependencies
uv sync             # Python venv + dependencies
vp config           # once after cloning: activates the pre-commit hook

docker compose up -d  # Postgres + Redis + Garage
pnpm dev            # FastAPI :8000 + Next.js :3000 + render worker
pnpm check          # format + lint + typecheck, both languages
pnpm check:fix
pnpm test           # Vitest + pytest
pnpm build          # export schema → generate client → next build
pnpm run ci         # everything CI runs
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
