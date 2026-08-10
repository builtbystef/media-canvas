---
id: jgo8tv
title: 'What is the generation contract: API shape, batch input format, job lifecycle, output delivery?'
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - k77nv9
parent: v1xa7j
created: 2026-08-08T07:09:08Z
updated: 2026-08-08T07:09:08Z
---

Interview the user (grill-me skill, limited to this question) to settle how assets are generated at scale.

Settle: the API surface for generation (render one asset from a template + values; submit a batch; poll or webhook for completion); the batch input format (CSV/JSON schema, how columns map to template variables); the job lifecycle (states, retries, partial failure of a 1,000-row batch, idempotency); and output delivery (where files land, naming, how the caller retrieves them, retention).

Input: templating semantics from node k77nv9 define what a row of values means and how bad values fail. The CLI and batch-upload UI are thin clients of this contract — settling it here settles most of them.
