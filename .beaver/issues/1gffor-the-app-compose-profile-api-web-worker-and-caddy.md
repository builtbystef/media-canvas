---
id: 1gffor
title: 'The app compose profile: api, web, worker, and Caddy'
state: done
assignee: agent
priority: high
depends_on:
    - i3r0dx
    - ilgj60
    - 6sfpv3
    - sycz8o
    - jmpc8g
parent: 88v6vg
created: 2026-08-15T06:23:15Z
updated: 2026-08-25T14:46:52Z
---

## What to build

One command turns a cloned repository into the running product. The infra profile keeps behaving as it does in development; an additional profile adds the api, the web app, the render worker, and a reverse proxy that is the single public application origin. Setting a domain is the only thing between HTTP on a laptop and HTTPS with automatic certificates on a server.

## Acceptance criteria

- [ ] Bringing up the app profile starts the api, the web app, one render worker, and the proxy alongside the infra services. The four app services restart unless explicitly stopped. The api, web app, and worker are built from the repository itself — no registry or published Media Canvas images; upstream Caddy and infra images remain allowed.
- [ ] The api and web Dockerfiles are created by this issue and live in the repository; the render worker uses the unchanged pinned Dockerfile from the rendering-core work (6sfpv3) and is not re-pinned here.
- [ ] The proxy is the only publicly reachable application origin. The infra services retain their existing development ports bound to `127.0.0.1`. The proxy routes the api paths, the asset paths, and the job paths to the api, and everything else to the web app.
- [ ] With a domain configured and `HTTP_PORT` left at its default `80`, the proxy serves HTTPS with automatic certificates and keeps plain HTTP only for the certificate challenge and a redirect. With no domain, it serves HTTP on `HTTP_PORT`. Port 443 may remain mapped but serves nothing in HTTP-only mode. Worked example: from a copied environment file, setting the domain variable and bringing the stack up again is the entire change — no certificate files are handled by hand.
- [ ] The api container applies migrations before it serves, so upgrading is pulling the repository and bringing the stack up again.
- [ ] Compose runs exactly one replica of the unchanged pinned render worker image — the same image the golden checks use. The fixed page-pool concurrency of eight remains the responsibility of the worker render implementation (1dxm2u), not this deployment issue.
- [ ] Certificates, database data, and object storage each survive `down` and `up` in named volumes.
- [ ] A fresh clone, a copied environment file with the required values filled in, and one compose command produce a stack that serves the sign-in page and completes a sign-in.

## Notes

**agent** — 2026-08-25T13:18:23Z

Blocked before implementation by a contradiction in the deployment contract. The default infra behavior must remain unchanged, and today postgres, redis, and Garage publish localhost ports. The app profile is additive: Docker Compose profiles can add services but cannot remove the ports from those always-enabled infra services. Therefore bringing up --profile app cannot both preserve the default infra services unchanged and make Caddy the only service with published ports. Options I see: (1) define 'only published origin' as only publicly reachable origin and keep the infra ports bound to 127.0.0.1; revise the acceptance criterion saying Caddy is the only service publishing ports accordingly, or (2) change the topology/commands so development and app mode use separate profiled infra service definitions, accepting that the current default compose behavior or service layout changes. There is also a sequencing gap: criterion 6 requires the worker's fixed internal concurrency of eight, but that pool is owned by unfinished issue 1dxm2u and does not exist in the current pinned worker image. Decide both points, record the decisions in a note, adjust dependencies/criteria as needed, and remove needs-review.

**agent** — 2026-08-25T14:33:31Z

Decision confirmed with the user after interview. Localhost-bound Postgres, Redis, and Garage ports remain for unchanged development behavior; Caddy is the only publicly reachable application origin. Repository-built/no-published-image requirements apply to api, web, and the unchanged pinned worker, while upstream Caddy and infra images are allowed. restart: unless-stopped applies to the four app services only. Compose owns one worker replica; 1dxm2u owns its eventual fixed internal concurrency of eight and does not block deployment. Caddy may keep 443 mapped in HTTP-only mode with no listener; HTTP_PORT is for HTTP-only mode and must remain at default 80 when DOMAIN is set, so a copied environment still enables HTTPS by changing DOMAIN alone. The issue body now states these boundaries.

**agent** — 2026-08-25T14:46:52Z

Implemented the app Compose profile. docker-compose.yml now adds repository-built api and web images, the unchanged pinned worker Dockerfile, and upstream Caddy; all four use restart: unless-stopped, only Caddy publishes application ports, and the existing localhost-bound infra ports and persistent Postgres/Garage volumes remain unchanged. Caddy routes /api, /assets, and /jobs to FastAPI and everything else to Next, uses an explicit HTTP site when DOMAIN is empty, and switches to Caddy automatic HTTPS when DOMAIN is set; /data is a named certificate volume. The api receives container-network database/storage/worker addresses and still applies its Alembic migrations in lifespan before serving. Added the api and web Dockerfiles, build-context ignore files, the Caddyfile, HTTP_PORT documentation, the one-command README path, and the Compose topology in ARCHITECTURE.md. The worker Dockerfile and its pin were not changed; normal Compose service cardinality is one worker. Deployment has no automated test seam by the parent spec. Verification: pnpm check passed; all 121 api tests passed against the sandbox socket services and all 238 TypeScript tests passed. The root pnpm test wrapper cannot carry the sandbox-only endpoint overrides into Vite+, and Docker/Podman commands are denied by this agent harness. pnpm build regenerated the unchanged API contract/client, then the existing next/font Google fetch was blocked by the sandbox domain allowlist; no endpoint changed and the generated files stayed clean. CI's existing compose config job will validate every profile.
