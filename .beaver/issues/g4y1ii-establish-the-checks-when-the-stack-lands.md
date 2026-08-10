---
id: g4y1ii
title: Establish the checks when the stack lands
state: todo
priority: high
labels:
    - maintenance
created: 2026-08-08T06:42:54Z
updated: 2026-08-08T06:42:54Z
---

The repository has no source code and no chosen stack, so the four checks — format, lint, typecheck, test — have no commands yet.

When the stack is chosen, set up the stack's standard tools with a minimal configuration:

- Format
- Lint
- Typecheck — start at the strictest settings the code passes; on a fresh project that means full strict, because this is the cheapest moment there will ever be.
- Test — a runner that fails on an empty suite gets one smoke test.

Also record the run command (how to start the app locally), and update the Checks section of `CLAUDE.md` and `AGENTS.md` with each real command. Each recorded command must run green on the current tree.

Re-running the `set-up-for-agents` skill does this work and is safe to run again.
