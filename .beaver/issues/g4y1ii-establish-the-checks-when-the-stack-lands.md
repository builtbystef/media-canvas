---
id: g4y1ii
title: Establish the checks when the stack lands
state: done
assignee: claude
priority: high
labels:
    - maintenance
created: 2026-08-08T06:42:54Z
updated: 2026-08-15T05:13:42Z
---

The repository has no source code and no chosen stack, so the four checks — format, lint, typecheck, test — have no commands yet.

## First: grill the stack, if it is not fully decided

Before touching any tooling, check whether the stack is settled end to end — every runtime, package manager, and workspace layout the checks would have to cover, in `docs/adr/` and `docs/ARCHITECTURE.md`. If anything a check command depends on is still open or only half-planned, run a grill session (the `grill-me` skill) and settle it first: a check command wired against a guessed layout is worse than no command, because it looks authoritative.

The grill has to close at least:

- Which runtimes exist in the repository, and the directory layout for each.
- Package manager and workspace/monorepo layout — one command per check, or per package with a root aggregator.
- Where the shared TypeScript core (ADR-0003) lives relative to the Next.js app and the render worker, since format/lint/typecheck all cross that boundary.
- How the Python side (FastAPI) and the TypeScript side are driven by a single set of four commands.

Record what the grill settles the usual way — the glossary for terms, an ADR for anything hard to reverse. If the stack is already fully settled, skip the grill and go straight to the setup.

## Then: set up the checks

With the stack settled, set up its standard tools with a minimal configuration:

- Format
- Lint
- Typecheck — start at the strictest settings the code passes; on a fresh project that means full strict, because this is the cheapest moment there will ever be.
- Test — a runner that fails on an empty suite gets one smoke test.

Also record the run command (how to start the app locally), and update the Checks section of `CLAUDE.md` and `AGENTS.md` with each real command. Each recorded command must run green on the current tree.

Re-running the `set-up-for-agents` skill does this work and is safe to run again.

## Notes

**claude** — 2026-08-14T06:07:03Z

Input from the editor-spec interview (node 9eooei, 2026-08-14): repository layout was deliberately left OPEN by the editor spec — this issue's stack grill owns it. Fixed by that interview and binding here: the web app is Next.js with Tailwind + shadcn/ui (Base UI variant) + Zustand; unit tests run under Vitest, e2e under Playwright; the shared TypeScript core, the Node render worker, and the FastAPI api are the other runtimes (ADR-0003/0005). Only their arrangement (workspace layout, package names, one-command-per-check wiring) is this issue's to settle.

**claude** — 2026-08-15T05:13:42Z

Grill (2026-08-15) settled the arrangement: the alloy template (~/Code/personal/alloy) is the base, inherited wholesale — apps/*+packages/*+tools/* layout, pnpm workspaces with catalog + supply-chain policy, Vite+ (vp) for TS format/lint/typecheck/test-running, uv + ruff + ty + pytest on Python, strict shared tsconfig presets, Node 24 / Python 3.14 / TS 7 / Next 16 pins. media-canvas adds apps/worker (render worker) and packages/core (@media-canvas/core, ADR-0003); the api-client + committed-openapi.json contract pattern carries over. Check vocabulary stays alloy's: pnpm check covers format+lint+typecheck, pnpm test covers Vitest+pytest. Playwright e2e will live in apps/web/e2e under a separate pnpm test:e2e, outside the four checks. Run command: docker compose up -d (Postgres+Redis) then pnpm dev (api+web+worker). No ADR by user decision — alloy is a starting point, not a standing dependency. Scaffold copied in, renamed, core+worker skeletons added, all checks green; AGENTS.md, README.md, and docs/ARCHITECTURE.md updated.
