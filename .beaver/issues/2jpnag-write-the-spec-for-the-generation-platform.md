---
id: 2jpnag
title: Write the spec for the generation platform
state: todo
labels:
    - roadmap:v1xa7j
    - session:spec
depends_on:
    - ylg1wr
    - jgo8tv
    - kjz6f0
parent: v1xa7j
created: 2026-08-11T00:28:43Z
updated: 2026-08-11T00:28:43Z
---

The generation-platform area is settled: MVP cut and pillar order (ylg1wr), the generation contract — API surface, batch input, job lifecycle, output delivery (jgo8tv), and the infrastructure — Postgres/Redis+BullMQ/MinIO, alloy-based monorepo, FastAPI-owned schema, worker-reports-via-API (kjz6f0, ADR-0004, ADR-0005).

Read those three nodes' notes and ADR-0004/0005 (not the whole roadmap). The core spec 1qoccb fixes the seams this spec consumes: core's validate/resolve/compile, the worker's render(svg, options), and the content-addressed asset read contract. Interview to close remaining gaps (likely: internal worker-report endpoint shape, job/row table sketch, queue payload contents, compose service details, dev bootstrap order). Confirm with the user, then invoke the create-specification skill. Publish the spec issue with blocking edges back to ylg1wr, jgo8tv, kjz6f0.
