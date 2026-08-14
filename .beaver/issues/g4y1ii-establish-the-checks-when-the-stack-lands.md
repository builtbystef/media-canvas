---
id: g4y1ii
title: Establish the checks when the stack lands
state: todo
priority: high
labels:
    - maintenance
created: 2026-08-08T06:42:54Z
updated: 2026-08-12T06:50:45Z
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
