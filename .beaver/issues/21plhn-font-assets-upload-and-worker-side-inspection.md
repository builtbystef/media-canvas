---
id: 21plhn
title: 'Font Assets: upload and worker-side inspection'
state: done
assignee: claude
priority: high
depends_on:
    - ilgj60
    - sazdn4
    - 92zwes
    - gxwr7t
parent: ek7pq1
created: 2026-08-15T07:12:07Z
updated: 2026-08-19T11:06:51Z
---

## What to build

A font enters the system. Bytes are hashed, and if that Workspace already holds them the existing asset comes straight back — a re-upload never pays for inspection twice. Otherwise the render worker parses the file with the very parser that will later measure every line of text in it, and only a font that parser accepts is stored. A file that fontTools would take but the render path cannot read is exactly the asset that would hard-error mid-render, so the gate is the render path's own parser.

## Acceptance criteria

- [ ] A Font Asset's identity is its Workspace together with the hash of its bytes; the same file uploaded into two Workspaces is two assets with two stored objects.
- [ ] Uploading bytes already held in that Workspace returns the existing record and creates nothing — not a duplicate, not an error. Worked example: uploading one file twice → the same id both times, one row, and inspection performed once.
- [ ] The worker's internal service gains a font-inspection call, behind the same shared credential as its other internal calls, that parses the bytes with the compiler's own font parser and reports family, subfamily, weight, italic, PostScript name, and whether the file is a variable font.
- [ ] A variable font, a file the parser cannot read, a format other than TTF or OTF, and a file over the size limit are each refused with their own machine-readable code and a message a user can act on. Worked example: a WOFF2 file → refused as an unsupported format with the advice to convert it first, and nothing is stored.
- [ ] A refused font never reaches storage: there is no quarantine area and nothing to sweep later.
- [ ] An accepted font is stored first and its row written second, so a row never points at bytes that are not there.
- [ ] The record carries a flag marking bundled fonts apart from uploaded ones; seeding the bundled families into a Workspace is tracked as its own issue and is not part of this slice.
- [ ] Uploading is Editor-level in the Workspace; a Viewer is refused.

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on 3ko2p7 (the asset upload pipeline): size and pixel limits, error codes and their messages, and the 422 error envelope. Read that note (beaver show 3ko2p7) before building - do not invent values the decision already fixed.

**claude** — 2026-08-19T11:06:38Z

Built: font upload at POST /api/v1/workspaces/{wsId}/fonts, and the worker's font-inspection call behind it.

COMPLETED WORK
- Worker: POST /fonts/inspect on the existing internal service (apps/worker/src/internal-service.ts), body application/octet-stream, behind the same bearer credential as /validate. It answers 200 with { readable: true, font: { format, family, subfamily, weight, italic, postScriptName, variable } } or { readable: false, problem: "unsupported_format" | "unparseable_font" } - a file the parser cannot read is an answer, not a failure, exactly as /validate reports a bad Row.
- Core: inspectFont / fontFormatOf in packages/core/src/fonts.ts, using opentype.js - the compiler's own parser, so the gate and the render-path metrics can never disagree. compile.ts's private sfnt-tag reading now goes through fontFormatOf, so the two formats are read in one place. No behavior change to compile.
- api: fonts.py (the route), worker.py (the api->worker seam, its httpx driver, and the RecordingWorker fake), assets.py (the SHA-256 id and the 422 refusal envelope), models.FontAsset + FontFormat, migration 0005_font_assets, and settings for the internal credential and the worker's address.
- Sequence, per node 3ko2p7 item 5: size check -> hash -> look up (workspace, hash) and short-circuit 200 -> inspect on the worker -> put the object -> insert the row -> 201. A refusal happens before the put, so nothing is ever stored for a font that was refused.
- Constants bound verbatim from 3ko2p7: 10 MB, SHA-256 full lowercase hex, codes file_too_large / unsupported_format / variable_font / unparseable_font, the 422 { error: { code, message } } envelope, content types font/ttf and font/otf.

DECISIONS A REVIEWER NEEDS
- IDENTITY IS A COMPOSITE PRIMARY KEY (workspace_id, id), not a surrogate id with a unique pair. The amendment on ek7pq1 makes the pair the identity, jr6mye addresses an asset by (workspace, hash), and documents carry the bare hash - a surrogate key would be a fourth name for a thing that already has three. Concurrent identical uploads resolve as ON CONFLICT DO NOTHING and then return the stored row, which is 3ko2p7 item 10 exactly.
- STORAGE KEY IS {workspaceId}/fonts/{id}.{ttf|otf}. Node 3ko2p7 fixed a flat fonts/{id} layout before tenancy; the u2ovlu amendment gives keys a workspace scope (outputs are {ws}/jobs/{jobId}/...), and 88v6vg's Workspace delete wants one prefix per Workspace per bucket. This is that prefix.
- THE WORKER ROUTE IS /fonts/inspect, NOT /internal/fonts/inspect. Node 3ko2p7 wrote the path before the worker's service existed; the service that shipped in gxwr7t mounts /validate, and spec 0egsmf's contract lists /validate and /render without a prefix. Every route on that service is internal, so the prefix would say nothing. The substance of item 1 - worker-side, opentype.js, shared credential, the fvar verdict plus the name fields - is unchanged.
- NEW DEPENDENCY, AND WHY IT IS ONE: httpx moves from apps/api's dev group to its runtime dependencies. The api has to call the worker over HTTP and had no client; httpx was already in the tree and the lockfile (it is what TestClient runs on), so nothing new enters the dependency graph, and it is async, which the routes are. Spec ek7pq1's Dependencies section names python-multipart (also added here) but no HTTP client; recorded as an amendment note on ek7pq1. Rejected: urllib.request in a threadpool, which hand-rolls timeouts and error mapping for no gain.
- A WRONG CREDENTIAL IS NAMED. A 401 from the worker raises WorkerUnreachable saying the two services must read the same INTERNAL_API_TOKEN, rather than "the worker did not answer" - it is the misconfiguration a deployer actually hits.
- THE 422 REFUSAL SHAPE IS DECLARED ON THE ROUTE (responses=REFUSES), so the generated client types the 422 the editor handles, rather than FastAPI's own validation-error shape.
- FontAssetView OMITS THE url FIELD the spec lists. The serving route is jr6mye's; emitting an address that 404s would be worse than leaving it out, and adding it is additive. Noted on jr6mye.

TESTS, AND THE SEAMS THEY SIT AT
- Worker internal service over real HTTP against real core (0egsmf seam 2), apps/worker/src/internal-service.test.ts: a bundled TTF's own facts, style bits off a Bold Italic, a WOFF2 refused for its format, a truncated file told apart as unparseable, a variable font reported as one, and the call refused without the credential. The variable font is built in the test by rebuilding a vendored TTF's sfnt directory with an fvar table - no vendored file is variable, and vendoring one would add a binary and a license for one assertion.
- FastAPI endpoints (ek7pq1 seam 2), apps/api/tests/test_fonts.py: the record, the stored bytes, two Workspaces holding the same bytes twice, the re-upload returning the same record with one inspection, each of the four refusals with nothing in the bucket afterwards, Editor-level with a Viewer refused and a stranger told only that there is no such workspace, and a put that fails leaving no row. Storage is the real Garage the compose file starts (as 92zwes established) rather than the fake the spec names; the worker's inspection is the fake, per the spec.
- HttpWorker itself has no automated test - it is the driver of the seam the tests fake. It was smoked by hand against the real worker service: a Lora italic read as Lora/Italic/400/italic, a wOF2 answered unsupported_format, and a wrong token raising the named credential error.

NOT COVERED, KNOWINGLY: the format: "otf" path is untested, because the repository holds no OTF file and one cannot be synthesized from a TrueType file (changing the sfnt tag alone yields a file the parser rejects). Bundled-font seeding is vn4r07; serving, listing and deletion are jr6mye.

Checks: pnpm run ci green - check, 150 TS tests, 77 Python tests, and build with no OpenAPI or client drift.
