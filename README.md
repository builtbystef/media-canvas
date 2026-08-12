# Media Canvas

A web app for designing static visual assets (Instagram posts, posters, ads, website graphics) and generating them in bulk.

You design in a visual editor. The design is saved as a versioned JSON **Design Document**. Any design can be promoted to a **Template**, which declares typed **Variables** (text, images, colors, numbers). Assets are then generated from that template — one-off in the web editor, in bulk through the REST API, or from an uploaded CSV.

## Status

Design stage. There is no source code yet — the repository currently holds the specs, the decisions, and the tracker. The stack is settled:

- **Frontend / editor** — Next.js, rendering the compiled SVG inline
- **Backend** — FastAPI; owns the database schema and is the only Postgres writer
- **Render worker** — Node + Playwright driving a pinned headless Chromium, in TypeScript
- **Shared core** — one TypeScript package with the Design Document schema, validation, variable substitution, and the JSON→SVG compiler, used by both the editor and the worker
- **Infrastructure** — Postgres (source of truth), Redis/BullMQ (work signal only), MinIO (object storage)

## Documentation

| Document | What it holds |
| --- | --- |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | The project's vocabulary — Design Document, Element, Template, Variable, and the rest |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The modules and the seams between them |
| [`docs/adr/`](docs/adr/) | Decisions that are hard to reverse, one file each |
| [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) | Conventions beyond the linter |
| [`docs/TRACKER.md`](docs/TRACKER.md) | How the issue tracker is used |

## License

MIT — see [LICENSE](LICENSE).
