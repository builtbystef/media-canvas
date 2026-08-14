---
id: p1fkjl
title: Write the spec for the batch generation UI
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - q44rtp
parent: v1xa7j
created: 2026-08-14T19:54:24Z
updated: 2026-08-14T20:23:45Z
---

The batch generation UI area is settled and needs its spec. The area is one closed node: q44rtp (surface split — Batch tab in the Generate dialog for submission, global Jobs page + /jobs/{id} route for monitoring; CSV-only upload with read-only preview and inline 422 display; polling cadences; per-Row downloads and the zip button; cancel/delete confirms; snapshot line; invisible idempotency key).

Read q44rtp's note and the generation platform spec 0egsmf including its amendment notes (the GET /jobs list endpoint added by q44rtp, and the 8h50hu POST /documents/{id}/render amendment). The editor spec (node 9eooei) covers the Generate dialog this UI adds a tab to. Interview to close any remaining gaps, confirm with the user, then invoke the create-specification skill. Publish the spec issue with a blocking edge back to q44rtp.

## Notes

**claude** — 2026-08-14T20:23:45Z

ANSWER: the batch generation UI spec is published as issue wz3ev2 ('Batch generation UI', label spec), with a blocking edge back to q44rtp, whose closure note it binds as normative.

Gaps closed by this session's interview (user confirmed 2026-08-14), now recorded in the spec:
- CSV submission transport: output format and idempotencyKey travel as flat query parameters on the text/csv POST — recorded as an amendment on spec 0egsmf, since the contract's CSV variant had no carrier for either.
- Failed Rows in the job view: natural row order with status filter chips + counts; the summary's failed count applies the Failed filter. No reordering.
- Large tables: both the CSV preview and the Row list virtualize via @tanstack/react-virtual; no visible-row caps.
- Client CSV parsing: papaparse.
- Shell navigation: minimal top nav (Documents | Jobs) on list-level pages; /jobs and /jobs/{id} as sibling routes; editor top bar unchanged.
- Snapshot line source: one un-polled GET /documents/{templateId}, comparing updatedAt to the job's createdAt; 404 → 'template no longer exists' variant. No contract change.
- Testing: two seams — Vitest over pure client logic (mapping summary, 422 merge, snapshot predicate, key rotation, polling cadence with fake timers) and one Playwright e2e ride-along (upload → submit → land on job view → completed → downloads).
- Derived at drafting, flagged and approved: submit stays enabled on client-visible mapping warnings (server 422 is the only gate); delete navigates to the Jobs page; the one-off tab stays the dialog's default.

No new glossary terms. Next step: invoke the create-issues skill with wz3ev2 to slice it for implementation.
