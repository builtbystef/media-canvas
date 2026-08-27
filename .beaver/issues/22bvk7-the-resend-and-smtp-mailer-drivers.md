---
id: 22bvk7
title: The Resend and SMTP Mailer drivers
state: done
assignee: agent
priority: medium
depends_on:
    - sycz8o
    - i3r0dx
parent: 88v6vg
created: 2026-08-15T06:22:30Z
updated: 2026-08-27T03:13:15Z
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

## Notes

**agent** — 2026-08-27T03:13:15Z

Done. The api selects a Mailer driver from MAILER at startup; console remains the default so an unset instance still signs people in from the log. Resend and SMTP send both message kinds, and a missing setting or unknown name fails startup naming the variable.

**What landed.** `build_mailer` in `mailer.py` constructs `ConsoleMailer`, `ResendMailer` (official `resend` SDK), or `SmtpMailer` (stdlib `smtplib`). Settings gain MAILER, RESEND_API_KEY, SMTP_*, EMAIL_FROM. `.env.example` and the api compose service pass those through. Tests cover construction, the worked missing-variable cases, and the unknown-driver refusal.

**Decisions a reviewer should know.**

- *resend>=2 is the new production dependency.* The parent spec named the official Resend Python SDK; SMTP stays stdlib. Transitive: requests and charset-normalizer.
- *Validation lives in build_mailer, not pydantic.* Console needs nothing extra; the real drivers fail naming the missing variable. That runs immediately after settings load, before the database or object store.
- *SMTP_PORT defaults to 587.* The spec lists it next to the other SMTP_* values; the worked examples only name host and sender. An omitted port is STARTTLS submission, not a startup failure.
- *SMTP_USER and SMTP_PASSWORD are required when MAILER=smtp,* matching the spec's config block. Tests cover the named worked examples (host, sender) rather than every field.
- *Seam is construction and configuration only,* as the spec's Testing Decisions required. Neither driver is exercised against a live mail service. The recording fake remains the HTTP-seam stand-in.
- *Tests force MAILER=console* in conftest so a developer's .env cannot send real mail when TestClient starts the app, before the recording fake is swapped in.

**Checks.** API format/lint/typecheck and 195 pytest; 402 TypeScript tests. Sandbox could not `uv sync` the new wheels (files.pythonhosted.org blocked); CI `uv sync --locked` will fetch them.
