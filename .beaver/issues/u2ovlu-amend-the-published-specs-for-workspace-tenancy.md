---
id: u2ovlu
title: Amend the published specs for workspace tenancy
state: done
assignee: claude
labels:
    - roadmap:v1xa7j
    - session:task
depends_on:
    - ejy8hn
parent: v1xa7j
created: 2026-08-15T04:01:44Z
updated: 2026-08-15T04:08:43Z
---

Node ejy8hn made v1 multi-tenant (ADR-0009), and the published specs were written single-user. Sweep every published spec issue (label `spec`) and amend each for tenancy, per ejy8hn's note. Known amendments:

- **Schema**: `workspace_id` FK on `documents`, `image_assets`, `font_assets`, `generation_jobs` (rows inherit via job). Asset identity becomes `(workspace_id, hash)` — the hash-only PK from node 3ko2p7 is per-workspace now; "a re-upload revives every reference" holds within one workspace only.
- **Storage keys**: gain a workspace scope (outputs `{ws}/jobs/{jobId}/...`, assets under a workspace prefix).
- **Routes**: collection/create endpoints become workspace-scoped (`/api/v1/workspaces/{wsId}/documents`, `.../assets`; batch submission stays `POST /templates/{id}/jobs` — the template's workspace scopes it). Item routes stay id-based; authorization = record's workspace × caller's Membership (or the API key's Workspace). The jobs list (q44rtp amendment) becomes per-workspace.
- **CORS**: the `Access-Control-Allow-Origin: *` font carve-out (3ko2p7) is deleted; asset bytes are authenticated; dev uses credentialed CORS pinned to the editor origin.
- **Web app**: a workspace switcher; per-workspace lists keep the 9eooei no-pagination rule.

This node is bookkeeping on existing spec issues (edit their bodies / add amendment notes, exactly as prior amendments were recorded) — the new auth/deployment surface itself is spec node n60ho8, which builds on these amendments. AFK: the ejy8hn note plus this list is the full brief; anything genuinely ambiguous goes back to the user, not guessed.

## Notes

**claude** — 2026-08-15T04:08:43Z

DONE (2026-08-15). All four published specs now carry a tenancy AMENDMENT note, in the same form as prior amendments (8h50hu, q44rtp, p1fkjl):

- 1qoccb (core): asset identity (workspace_id, hash), bare-hash refs inside documents resolve within the document's Workspace, workspace-prefixed storage keys, authenticated immutable URLs, CORS * deleted; schema/validation/compiler/render seams untouched — core stays tenancy-blind, FastAPI enforces scoping at the routes.
- 0egsmf (generation): workspace_id FK on generation_jobs (rows inherit via job); submission/render routes keep their shapes (the document's Workspace scopes them), item routes id-based with Membership-or-key-Workspace authorization; jobs list becomes GET /api/v1/workspaces/{wsId}/jobs; the auth-agnostic Out-of-Scope line superseded (session cookie or API key everywhere except OTP, invite acceptance, /health; keys Editor-equivalent on the generation surface only); output keys {workspaceId}/jobs/{jobId}/...; internal INTERNAL_API_TOKEN contracts unchanged.
- ek7pq1 (editor/assets): workspace_id FK on documents/font_assets/image_assets; per-Workspace dedupe and reference revival; Workspace-scoped collection/upload routes, id-based item routes; CORS * deleted (prod same-origin behind Caddy, dev credentialed CORS pinned to the editor origin, Cache-Control: private, immutable); workspace switcher in the shell; RBAC (Viewer read-only, Editor/Owner mutate).
- wz3ev2 (batch UI): pure client — jobs list route per-Workspace, everything else unchanged; RBAC lines for submit/cancel/delete vs. view/download.

One derived decision, flagged in the ek7pq1 note for the n60ho8 spec session to confirm: bundled fonts are seeded per Workspace at Workspace creation (idempotent), not once at app startup — forced by workspace_id being NOT NULL on font_assets in ejy8hn's ripple list; bundled flag and delete-409 behavior unchanged. Nothing else in the brief was ambiguous.

Spec node n60ho8 (deployment and access) builds on these amendments and is unblocked by this closure.
