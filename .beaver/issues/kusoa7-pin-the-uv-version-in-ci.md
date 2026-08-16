---
id: kusoa7
title: Pin the uv version in CI
state: done
assignee: claude
priority: medium
labels:
    - maintenance
created: 2026-08-16T22:56:59Z
updated: 2026-08-16T23:17:20Z
---

`.github/workflows/ci.yml` runs `astral-sh/setup-uv` without a `version:`, and the repository has no `uv.toml` and no `required-version` in `pyproject.toml`. Every CI run therefore installs whatever uv is newest at that moment:

```
Trying to find version for uv in: .../uv.toml
Could not find file: .../uv.toml
Trying to find version for uv in: .../pyproject.toml
Could not determine uv version from uv.toml or pyproject.toml. Falling back to latest.
Successfully installed uv version 0.12.5
```

Two consequences:

- A uv release can break CI with no diff in the repository to explain it, and a rerun of an old commit does not reproduce what that commit ran.
- The workflow SHA-pins its actions but then fetches an unpinned binary, so the pinning stops one step short.

No Dependabot ecosystem covers this. The `github-actions` ecosystem tracks the action reference, not the tool the action downloads; the `uv` ecosystem tracks the packages in `uv.lock`, not uv itself.

## Acceptance criteria

- The uv version used by CI is written down in the repository, either as `version:` on each `astral-sh/setup-uv` step or as a `required-version` that the action reads.
- A CI run logs that resolved version instead of falling back to latest.
- Whatever mechanism keeps it current is recorded — a Dependabot entry if one fits, otherwise a note that the bump is manual.

## Notes

**claude** — 2026-08-16T23:17:20Z

Pinned with required-version = "==0.12.3" in [tool.uv]. Chose required-version over a version: input on the setup-uv steps so local and CI read one source of truth, mirroring package.json packageManager. Pinned 0.12.3 rather than the 0.12.5 CI had been installing: 0.12.5 (Aug 14) and 0.12.4 (Aug 13) are younger than the 4-day supply-chain bar in pnpm-workspace.yaml. Verified with a standalone uv 0.12.3 against a clean worktree: sync --locked, ruff format/check, ty check and pytest all pass, and uv 0.9.24 is refused with 'Required uv version ==0.12.3 does not match the running version'.
