---
id: 68c3na
title: The deployment guide, executed end to end
state: done
assignee: agent
priority: medium
depends_on:
    - 1gffor
parent: 88v6vg
created: 2026-08-15T06:23:26Z
updated: 2026-08-29T08:13:54Z
---

## What to build

The document a deployer follows to put this product on a box and keep it there — first deploy, upgrade, backup, restore, and what TLS needs from them. Deployment has no automated test, so this guide is the verification: every step in it is run against a live stack before it is written down, and what the guide says is what actually happened.

## Acceptance criteria

- [ ] Prerequisites are stated: what must be installed, what kind of host, and what DNS is needed if HTTPS is wanted.
- [ ] The first-deploy path is written as executed: clone, copy and fill the environment file, bring the stack up, reach the sign-in page, sign in, create a Workspace.
- [ ] The upgrade path is written as executed: pull, bring the stack up again, and confirm migrations applied and the stack came back.
- [ ] The backup procedure is written as executed: a database dump and a copy of the object storage volume, with the commands that produced them.
- [ ] The restore procedure is written as executed against those artifacts on an empty stack, and the restored instance signs in and shows the same Workspace.
- [ ] TLS notes cover setting the domain, which ports must be reachable, and what to expect the first time certificates are issued.
- [ ] Each documented command was run by the session writing the guide, and the guide records nothing that was not.

## Notes

**agent** — 2026-08-29T06:26:31Z

Per-issue review gate lifted 2026-08-29: close this issue when the acceptance criteria are met, including executing every documented command and recording only what was run. The user will review the implement-loop run's full diff rather than gating closure here.

**agent** — 2026-08-29T08:13:54Z

Wrote docs/DEPLOYMENT.md by running first deploy, upgrade, backup, and restore against a live app-profile stack (isolated clone so the development compose project was left untouched). Linked it from the README docs table.

No test seam: the parent spec assigns verification to this guide. pnpm check and pnpm test passed after the doc landed.

What ran: clone, cp .env.example .env, openssl rand for the required secrets, docker compose --profile app up -d --build, GET /sign-in 200, GET /api/health schema_at_head true, OTP request/verify via the console Mailer log, POST /workspaces creating "Deploy Guide". git pull (already up to date) then the same compose up --build; health still at head (alembic 0009_api_keys). pg_dump plus docker compose cp of /var/lib/garage with garage stopped (meta/ and data/). down -v, restore the dump into a fresh postgres, replace the garage volume's meta/ and data/ via alpine:3.21, up -d; sign-in again showed the same Workspace. TLS notes from the live HTTP-only stack and compose config with DOMAIN set; this host had no public DNS, so a certificate was not issued.

Volume name in the restore command is the Compose project prefix plus garage-data (this session: media-canvas-deploy_garage-data).
