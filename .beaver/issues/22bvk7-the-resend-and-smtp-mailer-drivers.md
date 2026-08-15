---
id: 22bvk7
title: The Resend and SMTP Mailer drivers
state: todo
priority: medium
depends_on:
    - sycz8o
    - i3r0dx
parent: 88v6vg
created: 2026-08-15T06:22:30Z
updated: 2026-08-15T06:22:30Z
---

## What to build

A self-hosted instance sends real mail. The deployer picks a driver in the environment file and fills in that driver's settings; sign-in codes and invites then arrive in inboxes instead of the api log. A misconfiguration is caught when the process starts, not when the first person tries to sign in.

## Acceptance criteria

- [ ] The driver is selected by one environment variable, with the console driver as the default, so an instance that sets nothing keeps working offline.
- [ ] The Resend driver sends both message kinds through the provider's official client, using the configured sender address.
- [ ] The SMTP driver sends both message kinds over the configured host, port, and credentials, using the same sender address.
- [ ] Selecting a driver without its required settings fails startup with a message naming the missing variable. Worked examples: the Resend driver with no API key, and the SMTP driver with no host, each name the variable they need; either driver without a sender address does the same.
- [ ] An unknown driver name fails startup rather than falling back silently to the console.
- [ ] Each real driver has a thin construction and configuration test; neither is tested against a live mail service.
