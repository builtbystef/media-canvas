---
id: 047evd
title: 'Job output retrieval: per-Row links and the zip'
state: done
assignee: agent
priority: high
depends_on:
    - p45jd2
    - 211q1b
parent: wz3ev2
created: 2026-08-15T07:29:10Z
updated: 2026-08-26T12:56:46Z
---

## What to build

The files come down from the page that reports them. Each succeeded Row links to its own output at the address the server already handed over, and the whole job comes down as one archive from a single button in the header. Nothing here builds an address by hand and nothing receives a storage URL: every byte arrives through the api, which is what keeps a download subject to the same Workspace check as everything else.

## Acceptance criteria

- [ ] A succeeded Row links to its output at the address carried in the job's own response; the page never constructs that address itself.
- [ ] A Row that failed, was skipped, or has not finished offers no link. Worked example: a job with 812 succeeded and 6 failed shows 812 links and none on the failed Rows.
- [ ] Following a Row's link downloads that file with the content type of the job's output format.
- [ ] A header control downloads the whole job as one archive, and is enabled only when the job has reached a terminal state with at least one succeeded Row. Worked examples: rendering with 400 succeeded → disabled; completed with 0 succeeded → disabled; completed with 1 succeeded → enabled.
- [ ] The disabled control says why it is disabled rather than being silently inert.
- [ ] No storage URL, signed link, or credential appears anywhere in the page or its requests.
- [ ] A Viewer in the job's Workspace can use both routes out.
- [ ] The enablement rule is tested as pure logic over a job's state and counts.

## Notes

**agent** — 2026-08-26T12:01:21Z

Seam: client pure logic (Vitest, no browser) — the spec's seam 1. Enablement of the zip control is a function of job state and succeeded count; a Row's link is the url the job response already carried, or none.

**agent** — 2026-08-26T12:56:44Z

Built per-Row output links and the zip control on the job view. A succeeded Row's name is a download link at the url the job response already carried. Failed, skipped, and unfinished Rows have none. The header "Download all (.zip)" points at the contract zip endpoint and is enabled only when the job is terminal with at least one succeeded Row; when disabled, the reason is shown. `pnpm check` equivalent (`vp check` + package checks) green. 360 TS tests and 152 api tests green (api tests via the sandbox unix sockets).

**What landed.** `archiveControl`, `rowOutputHref`, and `jobArchiveHref` in `lib/job-view.ts`. The view uses those: the Row name becomes an `<a href={row.url} download>` only when `rowOutputHref` returns the carried address; the header control is a link to `/api/v1/jobs/{id}/outputs.zip` when enabled, otherwise a disabled button plus the reason.

**Seam.** Spec seam 1 — client pure logic, Vitest, no browser. Worked examples are literal: rendering/400 → disabled; completed/0 → disabled with a different reason; completed/1 → enabled; 812 succeeded + 6 failed → 812 links and none on the failed Rows.

**Decisions a reviewer should know.**

- *Per-Row addresses are never constructed.* `rowOutputHref` returns `row.url` for a succeeded Row and null otherwise, even if a failed Row somehow carried a url.
- *The zip href is the contract path.* The job response does not carry an archive url. The spec's "header button pointing at the contract's zip endpoint" is `/api/v1/jobs/{id}/outputs.zip`. Same-origin, so the session cookie goes with it and a Viewer can follow both routes. No storage URL, signed link, or credential.
- *No role gating in the UI.* Anyone who can open the page (any member, Viewer included) sees the same links. The api already admits Viewers on both download routes.
- *Cancel, delete, and the snapshot line stay with xhps0x.*

**Testing.** `lib/job-view.test.ts` now has 11 cases (3 new).
