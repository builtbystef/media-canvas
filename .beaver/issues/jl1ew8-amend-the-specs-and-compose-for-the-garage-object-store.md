---
id: jl1ew8
title: Amend the specs and compose for the Garage object store
state: done
assignee: claude
priority: high
labels:
    - roadmap:v1xa7j
    - session:task
parent: v1xa7j
created: 2026-08-17T00:49:51Z
updated: 2026-08-17T01:21:04Z
---

Node kjz6f0 chose MinIO from day one behind the S3 API, and several issues carry that name. That choice no longer holds; this node replaces it with Garage and sweeps the specs that name it. No new behaviour — the S3 seam, the bucket bootstrap, the proxied serving, and every storage key layout stay exactly as specified. Only the store behind the S3 API changes.

## Why Garage

MinIO stopped publishing community Docker images, stripped most of the console from the AGPL build, and archived the repository: `minio/minio` is frozen at `RELEASE.2025-09-07T16-13-09Z` and will never receive another security fix. Keeping it would mean a permanently unpatchable network service inside software other people self-host.

The replacement is chosen for the shape of the organisation behind it, because MinIO failed on governance rather than on engineering. Deuxfleurs is a non-profit funded by public grants with no VC, and Garage is a single binary aimed at exactly this one-node self-hosted deployment rather than scaled down to it. Since v2.3.0 it bootstraps from the environment — `server --single-node --default-access-key --default-bucket` reads `GARAGE_DEFAULT_ACCESS_KEY`, `GARAGE_DEFAULT_SECRET_KEY` and `GARAGE_DEFAULT_BUCKET`, so there is no init container and no CLI step, exactly as MinIO's root credentials worked.

AGPL costs nothing here: Garage runs unmodified in its own container, the api reaches it over the standard S3 HTTP API as a separate program, and the no-presigned-URL rule (0egsmf) means no outside user ever interacts with it. The residual cost is that licence scanners flag it during enterprise diligence.

The product uses only `PutObject`, `GetObject`, `DeleteObject`, prefix delete, list, and an idempotent bucket create at startup, and the connection details come from the environment (92zwes) — so a hosted deployment points the same code at Cloudflare R2 or AWS S3 without a code change, which is what ADR-0009's "most of the way to a hosted SaaS" needs.

Rejected: keeping the frozen MinIO tag (above); RustFS — a literal drop-in with a permissive licence, but `v1.0.0-alpha`; SeaweedFS — Apache-2.0 and production-proven since 2012, the fallback if the AGPL flag ever costs more than it saves, at the price of running a distributed filesystem for 5% of its surface; and dropping the S3 API for a plain volume — cheapest of all, but it deletes the one-variable path to hosted object storage.

## Known amendments

- **0egsmf (spec, generation platform)** — the Deployment section's infra list (`minio/minio` at a pinned RELEASE tag, ports 9000 + 9001 console) becomes `dxflrs/garage:v2.3.0` on its S3 port 3900, with no console to expose. The runtime-topology line "MinIO holds assets and outputs behind the S3 API" names Garage instead. The Dependencies section is untouched: still boto3 on the api, still the AWS SDK for JS on the worker, still the same calls.
- **88v6vg (spec, deployment and access)** — the default-profile infra list and the named-volume list swap `minio` for `garage` (Garage keeps data and metadata in separate directories, so it is two volumes or one with two subpaths — implementer's choice). `.env.example` loses `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` and gains `GARAGE_DEFAULT_ACCESS_KEY`, `GARAGE_DEFAULT_SECRET_KEY`, `GARAGE_DEFAULT_BUCKET`, plus Garage's own `rpc_secret` — all generated with `openssl rand -hex 32`, as the file already says for the other secrets. The backup procedure's "MinIO data copy" becomes a Garage data + metadata copy.
- **i3r0dx (the infra compose profile)** — the acceptance criterion naming a pinned MinIO names Garage. The healthcheck and localhost-binding criteria are unchanged and still apply.
- **v1xa7j (roadmap)** — three settled/Frontier bullets name MinIO (local-disk storage rejected, quarantine prefix rejected, scheduled backup rejected). Every decision holds; only the noun changes.
- **docker-compose.yml + README** — the `minio` service becomes `garage`, volumes renamed; the README's Infrastructure line names MinIO.

One thing to verify while amending 0egsmf, because it is the only place the swap is not purely cosmetic: 0egsmf says "the api ensures its buckets on startup (idempotent)", and 92zwes makes that an acceptance criterion. Garage grants bucket creation per access key rather than globally, so a key minted by `--default-access-key` may not be permitted to call `CreateBucket`. Either the key is granted that permission, or `--default-bucket` creates the bucket and the api's startup check becomes a verify-and-fail-loudly rather than a create. Settle it in the amendment so 92zwes inherits an answer instead of a surprise.

## Not in scope, deliberately

- **92zwes (the byte seam) needs no amendment.** Every one of its acceptance criteria says "object storage" and none names a vendor. It was written correctly; it stays as it is.
- **Done nodes stay as written.** kjz6f0, ex95f4, 3ko2p7 and 2jpnag are the record of what was decided when. kjz6f0 carries a note pointing here; its Postgres, Redis and repo-layout halves are untouched.
- **No ADR.** The original object-storage choice lived in kjz6f0, not in `docs/adr/` — a like-for-like replacement does not clear a higher bar than the decision it replaces. The reasoning above is the record.
- **The no-presigned-URL rule is untouched.** A note for whoever revisits it: proxying every byte through FastAPI is the right call for v1 (stable immutable URLs, hidden topology, one enforcement point), but at hosted scale it puts every generated asset through the app servers twice. That is a 0egsmf decision to reopen when hosting is real, not part of this sweep.

AFK: this node is the full brief; anything genuinely ambiguous goes back to the user rather than being guessed.

## Notes

**claude** — 2026-08-17T01:20:58Z

DONE (2026-08-16). MinIO is gone from every live spec and from the repo; Garage v2.3.0 replaces it behind the same S3 API. No storage decision changed — the S3 seam, the bucket bootstrap, the proxied serving and every key layout are as they were.

THE OPEN QUESTION IS SETTLED, WITH EVIDENCE. The api still creates its buckets on startup, exactly as 0egsmf and 92zwes already say. Garage's `--default-access-key` mints a key with `allow_create_bucket` set (source: `server.rs` sets `allow_create_bucket.update(true)`; verified by running the container and calling CreateBucket with boto3). Garage's `--default-bucket` flag is therefore NOT used: a second place naming the bucket could only disagree with the api's own configuration. Consequence for 92zwes's implementer — "idempotent" means catching an error, not getting a 200: Garage answers a repeat CreateBucket with `BucketAlreadyOwnedByYou`, as AWS S3 does outside us-east-1. Treat `BucketAlreadyOwnedByYou` and `BucketAlreadyExists` as success.

FOUR FACTS THAT ONLY A REAL RUN GIVES, ALL NOW IN THE SPECS. (1) Garage will not start without a config file at /etc/garage.toml, and metadata_dir, data_dir and the bind addresses have no environment-variable equivalents — only secrets do. So `infra/garage.toml` is committed and bind-mounted read-only; it holds no secret. (2) `GARAGE_RPC_SECRET` is mandatory even for a single node (32 bytes hex). (3) Garage rejects a secret key shorter than 16 characters — caught by the compose file failing to boot with the dev credential the rest of the file uses. (4) State is `/var/lib/garage/{meta,data}`, so ONE named volume at /var/lib/garage covers both; the image is a scratch image holding one static binary with no shell, so i3r0dx's healthcheck must be exec form — `[\"CMD\", \"/garage\", \"status\"]` exits 0 once the node serves — or publish the admin port for its unauthenticated `GET /health`.

AMENDED: 0egsmf (topology, queue upload target, dev environment rewritten with the bootstrap and the bucket answer, test seam 3 now says \"S3-compatible store\"); 88v6vg (infra list, named volumes plus the config-file mount, .env.example — MINIO_ROOT_USER/PASSWORD out, GARAGE_DEFAULT_ACCESS_KEY/SECRET_KEY and GARAGE_RPC_SECRET in, and a line saying that one credential is read from both ends, backup procedure now a stopped-container copy of meta+data so LMDB stays consistent with the blocks it indexes); i3r0dx (both affected acceptance criteria); v1xa7j (three settled bullets renamed, two new Out of scope lines, the productizing Frontier entry now carries the byte-proxy cost). Vendor-neutral prose won wherever the sentence did not need a product name.

ADDED: infra/garage.toml. CHANGED: docker-compose.yml (garage replaces minio, one volume, port 3900), README (two lines). NOT TOUCHED, as the brief directed: 92zwes (vendor-neutral already), the closed nodes kjz6f0/ex95f4/3ko2p7/2jpnag, and no ADR.

VERIFIED, NOT ASSERTED: `docker compose up -d garage` from the committed file boots, mints the key, accepts the api-shaped CreateBucket, round-trips PutObject/GetObject/list/delete, survives a restart with data and key intact (the bootstrap runs once), and `/garage status` exits 0 inside the container. `pnpm check` passes.

DEVIATION FROM THE BRIEF, DELIBERATE: the brief listed GARAGE_DEFAULT_BUCKET among the new .env.example variables. It is not there, because the brief's own either/or resolved to the first branch — the key may create buckets — which makes the variable a duplicate name. Reverse it by adding `--default-bucket` to the compose command and the variable to .env.example; nothing else would change.
