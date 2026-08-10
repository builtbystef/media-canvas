The project's purpose and its stack are not decided yet. The repository holds no source code. Settle the purpose before proposing a stack, and record what gets settled in `docs/` — the glossary for the terms, an ADR for each decision that is hard to reverse.

## Checks

There are no check commands yet, because there is no code and no stack. Beaver issue `g4y1ii` establishes format, lint, typecheck, and test once the stack lands; re-running the `set-up-for-agents` skill does that work.

Until then: when your change introduces the stack, set up its standard tools in the same session, and replace this section with the real commands.

## Project docs & tracker

### Domain glossary

`docs/GLOSSARY.md` — the project's terms. Use its vocabulary in code, tests, specs, and issues. The format rules are at the top of the file.

### Coding standards

`docs/CODING_STANDARDS.md` — the conventions beyond the linter. Reviews check diffs against it.

### Architecture & decisions

`docs/ARCHITECTURE.md` — the modules and the seams. `docs/adr/` — decisions already made (the format is in `docs/adr/README.md`). Do not debate them again.

### Issue tracker

`docs/TRACKER.md` — how to use this project's issue tracker: Beaver Backlog, via the `beaver` CLI, with the issues in `.beaver/issues/`.
