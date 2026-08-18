---
id: etfqc7
title: next dev writes its own AGENTS.md into apps/web
state: done
assignee: claude
priority: medium
labels:
    - maintenance
created: 2026-08-18T10:37:44Z
updated: 2026-08-18T22:14:15Z
---

## What to build

Running `next dev` creates two untracked files, `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`, and re-creates them whenever it is run again. They come from Next itself (`node_modules/next/dist/server/lib/generate-agent-files.js`), not from anyone on this project. They were noticed during jmpc8g and deliberately left uncommitted, because what to do with them is a project decision rather than that issue's.

`apps/web/CLAUDE.md` is a single `@AGENTS.md` include. `apps/web/AGENTS.md` holds a Next-authored block that instructs an agent working in that directory to treat its own training as wrong about Next and to read `node_modules/next/dist/docs/` first. The block also argues for committing itself. Whatever the merits, it is vendor text that would override this project's own instructions for everything under `apps/web`, and it lands there without review each time the dev server runs.

## Acceptance criteria

- [ ] The repository takes a position: the files are committed, ignored, or suppressed — one of the three, not left to reappear as noise in every working tree.
- [ ] If they are committed, someone has read the block and agrees it should apply to agents working in `apps/web`; the root `AGENTS.md` says how the two relate.
- [ ] If they are ignored or suppressed, `pnpm dev` no longer leaves a dirty working tree behind it.
- [ ] Whatever is chosen survives a Next upgrade re-writing the block, or the issue says plainly that it does not.

## Notes

**claude** — 2026-08-18T22:14:15Z

Committed both files. apps/web/AGENTS.md carries a project-authored preamble above the vendor block: the root AGENTS.md is authoritative, and the block is scoped to Next's own APIs and conventions. The block itself is left byte-identical, so next dev's gate (hasCurrentAgentRules) short-circuits and the tree stays clean; verified by calling the generator directly — hasCurrentAgentRules('apps/web') is true, and a forced writeAgentFiles returns {agentsMd: 'unchanged', claudeMd: 'skipped'} with the file byte-identical. The generator upserts only between its markers, so the preamble survives. Root AGENTS.md gained a 'Nested agent instructions' section saying how the two relate.

On the fourth criterion: it survives a Next upgrade, but not silently. New block wording is written into the tracked file, which shows up as a reviewable diff someone must approve. That is the intended behaviour, not immunity.

Ignoring and suppressing were both rejected. Ignoring only hides the dirty tree — agents still load the file from disk, so the vendor text would govern apps/web unreviewed, and change silently on upgrade. Suppressing has no supported switch in Next 16.3.0: app-info-log.js gates solely on @vercel/detect-agent, which sniffs CLAUDECODE, CLAUDE_CODE, AI_AGENT, CURSOR_AGENT, CODEX_* and about a dozen more, so it would mean scrubbing env vars in the dev script — brittle as that list grows, and bypassed by running next dev directly.
