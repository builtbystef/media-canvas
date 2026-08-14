---
id: p1fkjl
title: Write the spec for the batch generation UI
state: todo
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - q44rtp
parent: v1xa7j
created: 2026-08-14T19:54:24Z
updated: 2026-08-14T19:54:24Z
---

The batch generation UI area is settled and needs its spec. The area is one closed node: q44rtp (surface split — Batch tab in the Generate dialog for submission, global Jobs page + /jobs/{id} route for monitoring; CSV-only upload with read-only preview and inline 422 display; polling cadences; per-Row downloads and the zip button; cancel/delete confirms; snapshot line; invisible idempotency key).

Read q44rtp's note and the generation platform spec 0egsmf including its amendment notes (the GET /jobs list endpoint added by q44rtp, and the 8h50hu POST /documents/{id}/render amendment). The editor spec (node 9eooei) covers the Generate dialog this UI adds a tab to. Interview to close any remaining gaps, confirm with the user, then invoke the create-specification skill. Publish the spec issue with a blocking edge back to q44rtp.
