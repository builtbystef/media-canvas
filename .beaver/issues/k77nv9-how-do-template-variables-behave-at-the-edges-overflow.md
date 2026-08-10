---
id: k77nv9
title: 'How do template variables behave at the edges: overflow, aspect mismatch, missing values?'
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
depends_on:
    - 53lwlc
parent: v1xa7j
created: 2026-08-08T07:08:59Z
updated: 2026-08-08T07:08:59Z
---

Interview the user (grill-me skill, limited to this question) to settle templating semantics — the behavior when injected content does not fit the design.

Settle: text that overflows its box (shrink-to-fit, truncate, ellipsis, reflow, error?); images whose aspect ratio differs from the slot (cover, contain, stretch, focal point?); missing or empty variable values (default value, skip render, hard error?); value validation (types, max lengths, color formats, price formatting); and whether a template declares per-variable rules or the format fixes one global behavior.

Input: the design format from node 53lwlc defines what a variable slot is. These semantics must be identical in the editor preview and the worker render.
