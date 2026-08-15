---
id: 92zwes
title: 'Object storage: the byte seam, bucket bootstrap, and proxied serving'
state: todo
priority: high
depends_on:
    - ilgj60
    - i3r0dx
parent: 0egsmf
created: 2026-08-15T06:54:15Z
updated: 2026-08-15T06:54:15Z
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
