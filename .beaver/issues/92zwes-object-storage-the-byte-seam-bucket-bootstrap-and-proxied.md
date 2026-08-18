---
id: 92zwes
title: 'Object storage: the byte seam, bucket bootstrap, and proxied serving'
state: done
assignee: claude
priority: high
depends_on:
    - ilgj60
    - i3r0dx
    - jl1ew8
parent: 0egsmf
created: 2026-08-15T06:54:15Z
updated: 2026-08-18T10:02:41Z
---

## What to build

The api can hold bytes and give them back. Object storage is configured from the environment like every other setting, the buckets the product needs exist after startup without anyone creating them by hand, and stored bytes reach a client only by the api streaming them itself — never as a storage URL, a credential, or a signed link. Everything later in this spec that stores or serves a file sits on this seam, and so does the asset pipeline in another spec.

## Acceptance criteria

- [ ] Object storage connection details come from the environment through the same settings mechanism the database uses; a missing required value fails startup with a message naming the variable.
- [ ] The buckets the product needs exist once the api has started, and starting again against the same storage changes nothing and raises nothing.
- [ ] The seam can store bytes under a key, read them back, delete one key, and delete every key under a prefix. Worked example: three objects written under one prefix, then that prefix deleted — none of the three remain, and an object under a neighbouring prefix is untouched.
- [ ] Reading a key that does not exist is a distinguishable not-found result, not an opaque storage exception surfacing to the caller.
- [ ] There is one reusable path for handing stored bytes to a client: it streams rather than buffering the whole object in memory, and carries the stored content type.
- [ ] Deleting a prefix that holds nothing succeeds rather than failing, so cleanup is safe to run twice.
- [ ] These behaviors are verified against real object storage started by the project's compose file, through the ordinary test command.

## Notes

**claude** — 2026-08-18T10:02:41Z

Built. The api reads its object storage configuration from the environment, creates its buckets at startup, and holds, reads, deletes and streams bytes through one seam. All checks green (pnpm run ci); the storage tests run against the Garage the compose file starts.

WHAT LANDED

- `storage.py` — `ObjectStore` (the boto3 client plus the two buckets it owns), `Bucket` (ensure / put / open / delete / delete_prefix), `StoredObject` (content type, size, and the body still on the wire), and `serve(bucket, key)`, the one path from storage to a response.
- `settings.py` — `storage_endpoint` (default http://localhost:3900), `storage_region` (default garage), `assets_bucket` / `outputs_bucket` (default media-canvas-assets / media-canvas-outputs), and the credential, read under the names the store itself is booted with: `storage_access_key` and `storage_secret_key` carry `validation_alias` GARAGE_DEFAULT_ACCESS_KEY / GARAGE_DEFAULT_SECRET_KEY. Pydantic reports the alias, so a missing value still fails startup naming the variable the deployer set — verified: "GARAGE_DEFAULT_SECRET_KEY: field required".
- `main.py` — the lifespan builds the store and ensures the buckets before serving.
- `.env.example` gains the four optional variables; `.github/workflows/ci.yml` starts garage alongside postgres for the api job.
- Dependency added: boto3, as spec 0egsmf's Dependencies section names for the api.

DECISIONS

- TWO BUCKETS, per node 3ko2p7: `media-canvas-assets` (write-once) and `media-canvas-outputs` (deleted with a Job). That is what "the buckets the product needs" means, and the boundary is what keeps a job's prefix wipe from reaching an asset.
- AN UNREACHABLE STORE STOPS STARTUP, unlike an unreachable database. The database can come up degraded because /api/health reports it; there is no equivalent field for storage, so a silent degrade would be invisible until the first byte was wanted. Adding storage to /api/health was not in this issue's criteria and was left alone.
- VENDOR-NEUTRAL FIELD NAMES, VENDOR-NAMED VARIABLES. The api's code says storage; the environment says GARAGE_DEFAULT_*, because 88v6vg makes that pair one credential read from both ends. Endpoint and region are the api's own, so pointing at R2 or S3 is two variables and no code change (jl1ew8).
- THE SEAM IS SYNCHRONOUS, because boto3 is. The routes that later serve bytes should be `def` handlers, which Starlette runs in a threadpool; `serve` hands `StreamingResponse` a synchronous iterator, which Starlette also drains off the event loop.
- "IDEMPOTENT" IS A CAUGHT ERROR, as jl1ew8 warned: BucketAlreadyOwnedByYou and BucketAlreadyExists are treated as success. Confirmed against Garage v2.3.0 — a repeat CreateBucket raises BucketAlreadyOwnedByYou, so the catch is load-bearing rather than decorative.
- NOT-FOUND IS EXACTLY NoSuchKey. A missing bucket, a bad credential or a store that is down all still raise, so only the one distinguishable case is swallowed.

SEAM CHOSEN, AND WHY. Spec 0egsmf names three test seams and none of them is this; no public route stores or serves a file yet, so the tests read `ObjectStore` itself, which is the outermost seam that can observe these criteria. The serving path is exercised over HTTP through a small FastAPI app built in the test, standing in for the routes to come. Tests use their own buckets (media-canvas-test-*), the way they already use their own database, and are emptied between tests with the S3 client directly rather than through the prefix delete they are testing.

ONE THING THE TESTS CANNOT SAY. Starlette's TestClient buffers a whole response, so "streams rather than buffering" is verified one level down: a 200 KiB object comes out of `StoredObject.chunks()` in pieces, none of them the whole object, and reassembles exactly.

VERIFIED, NOT ASSERTED. Against a virgin Garage booted from the committed compose file with CI-shaped generated secrets (throwaway project and volume, torn down afterwards): the bucket bootstrap runs twice cleanly, a round trip returns the bytes and the content type, and a missing key answers None. The CI env-file generation was run through `docker compose config` and through the settings loader — the appended GARAGE_DEFAULT_SECRET_KEY and GARAGE_RPC_SECRET win over the placeholders in both, which they must, since Garage rejects a secret key under 16 characters and an RPC secret that is not 32 bytes of hex.
