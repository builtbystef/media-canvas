---
id: u2ovlu
title: Amend the published specs for workspace tenancy
state: todo
labels:
    - roadmap:v1xa7j
    - session:task
depends_on:
    - ejy8hn
parent: v1xa7j
created: 2026-08-15T04:01:44Z
updated: 2026-08-15T04:01:44Z
---

Node ejy8hn made v1 multi-tenant (ADR-0009), and the published specs were written single-user. Sweep every published spec issue (label `spec`) and amend each for tenancy, per ejy8hn's note. Known amendments:

- **Schema**: `workspace_id` FK on `documents`, `image_assets`, `font_assets`, `generation_jobs` (rows inherit via job). Asset identity becomes `(workspace_id, hash)` — the hash-only PK from node 3ko2p7 is per-workspace now; "a re-upload revives every reference" holds within one workspace only.
- **Storage keys**: gain a workspace scope (outputs `{ws}/jobs/{jobId}/...`, assets under a workspace prefix).
- **Routes**: collection/create endpoints become workspace-scoped (`/api/v1/workspaces/{wsId}/documents`, `.../assets`; batch submission stays `POST /templates/{id}/jobs` — the template's workspace scopes it). Item routes stay id-based; authorization = record's workspace × caller's Membership (or the API key's Workspace). The jobs list (q44rtp amendment) becomes per-workspace.
- **CORS**: the `Access-Control-Allow-Origin: *` font carve-out (3ko2p7) is deleted; asset bytes are authenticated; dev uses credentialed CORS pinned to the editor origin.
- **Web app**: a workspace switcher; per-workspace lists keep the 9eooei no-pagination rule.

This node is bookkeeping on existing spec issues (edit their bodies / add amendment notes, exactly as prior amendments were recorded) — the new auth/deployment surface itself is spec node n60ho8, which builds on these amendments. AFK: the ejy8hn note plus this list is the full brief; anything genuinely ambiguous goes back to the user, not guessed.
