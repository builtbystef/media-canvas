---
id: 68c3na
title: The deployment guide, executed end to end
state: todo
priority: medium
depends_on:
    - 1gffor
parent: 88v6vg
created: 2026-08-15T06:23:26Z
updated: 2026-08-15T06:23:26Z
---

## What to build

The document a deployer follows to put this product on a box and keep it there — first deploy, upgrade, backup, restore, and what TLS needs from them. Deployment has no automated test, so this guide is the verification: every step in it is run against a live stack before it is written down, and what the guide says is what actually happened.

Closure waits for user review.

## Acceptance criteria

- [ ] Prerequisites are stated: what must be installed, what kind of host, and what DNS is needed if HTTPS is wanted.
- [ ] The first-deploy path is written as executed: clone, copy and fill the environment file, bring the stack up, reach the sign-in page, sign in, create a Workspace.
- [ ] The upgrade path is written as executed: pull, bring the stack up again, and confirm migrations applied and the stack came back.
- [ ] The backup procedure is written as executed: a database dump and a copy of the object storage volume, with the commands that produced them.
- [ ] The restore procedure is written as executed against those artifacts on an empty stack, and the restored instance signs in and shows the same Workspace.
- [ ] TLS notes cover setting the domain, which ports must be reachable, and what to expect the first time certificates are issued.
- [ ] Each documented command was run by the session writing the guide, and the guide records nothing that was not.
