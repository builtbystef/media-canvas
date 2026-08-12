---
id: 3ko2p7
title: What is the asset upload pipeline and storage layout for fonts and images?
state: todo
labels:
    - roadmap:v1xa7j
    - session:grill
parent: v1xa7j
created: 2026-08-12T02:57:52Z
updated: 2026-08-12T02:57:52Z
---

Interview the user (grill-me skill, limited to this question) to settle the write side of asset storage.

Both published specs fixed the read side and deliberately left the write side open. The core spec (1qoccb): "Assets are content-addressed. A Font Asset (TTF/OTF) and an Image Asset are each one file whose id is the hash of its bytes, served from app storage at an immutable URL. The worker verifies the hash on load." Its Out of Scope: "Upload endpoints and upload UI for fonts and images; this spec defines only the content-addressed read contract." The generation platform spec (0egsmf) excludes the same, and fixes that all file serving proxies through FastAPI — never presigned URLs — so uploads have a shape to match.

The font contract (node oxcf2v) already constrains what may be accepted: TTF and OTF only, with a convert-first message for WOFF2 (opentype.js cannot parse it); variable fonts rejected at upload via `fvar`-table detection, because opentype.js metrics off the default instance are unreliable; nine bundled families vendored in the repo, never a CDN. Those rules need an enforcement point, and this node decides where it lives.

Settle: which endpoints accept an upload and what they return; where hashing and validation happen (FastAPI, or a crossing to the worker, given that font parsing is TypeScript-only under ADR-0003); the MinIO key layout for Font Assets, Image Assets, and their derived metadata, alongside the `jobs/{jobId}/` prefix the generation spec already claims; what metadata is stored per asset (family name and weight for the font picker, intrinsic dimensions for images) and in which Postgres tables under ADR-0005; the size and format limits and what a rejection says; what a re-upload of identical bytes does; whether an asset is ever deleted, given that a stored Design Document may reference it forever; and the upload UI's shape in the editor for both fonts and images.

Input: the core spec 1qoccb, the generation platform spec 0egsmf, node oxcf2v (font contract), ADR-0004 and ADR-0005.
