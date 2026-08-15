---
id: 1gffor
title: 'The app compose profile: api, web, worker, and Caddy'
state: todo
priority: high
depends_on:
    - i3r0dx
    - ilgj60
    - 6sfpv3
parent: 88v6vg
created: 2026-08-15T06:23:15Z
updated: 2026-08-15T06:23:15Z
---

## What to build

One command turns a cloned repository into the running product. The infra profile keeps behaving as it does in development; an additional profile adds the api, the web app, the render worker, and a reverse proxy that is the single published origin. Setting a domain is the only thing between HTTP on a laptop and HTTPS with automatic certificates on a server.

## Acceptance criteria

- [ ] Bringing up the app profile starts the api, the web app, the render worker, and the proxy alongside the infra services, all restarting unless explicitly stopped, all built from the repository itself — no registry, no published images.
- [ ] The proxy is the only service publishing ports. It routes the api paths, the asset paths, and the job paths to the api, and everything else to the web app.
- [ ] With a domain configured, the proxy serves HTTPS with automatic certificates and keeps plain HTTP only for the certificate challenge and a redirect. With no domain, it serves HTTP on the configured port. Worked example: setting the domain variable and bringing the stack up again is the entire change — no certificate files are handled by hand.
- [ ] The api container applies migrations before it serves, so upgrading is pulling the repository and bringing the stack up again.
- [ ] The render worker runs as the pinned image from the rendering-core work — the same image the golden checks use — with one replica and its internal concurrency of eight.
- [ ] Certificates, database data, and object storage each survive `down` and `up` in named volumes.
- [ ] A fresh clone, a copied environment file with the required values filled in, and one compose command produce a stack that serves the sign-in page and completes a sign-in.
