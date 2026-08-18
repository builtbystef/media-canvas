The root `AGENTS.md` is this project's instruction file, and it applies here too. It wins wherever the two disagree.

The block below is written and re-written by `next dev`, not by anyone on this project. It is committed so that the dev server leaves a clean tree, and so that a Next upgrade changing its wording shows up as a reviewable diff instead of a silent edit in an ignored file. Read it as scoped to one question — Next's own APIs and conventions, where this version does differ from most training data, and where `node_modules/next/dist/docs/` is the better source. It is not a licence to set aside the project's standards, tests, or review.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
