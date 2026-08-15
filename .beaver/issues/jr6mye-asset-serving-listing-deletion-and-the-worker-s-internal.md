---
id: jr6mye
title: Asset serving, listing, deletion, and the worker's internal access
state: todo
priority: high
depends_on:
    - 21plhn
    - t60pvx
parent: ek7pq1
created: 2026-08-15T07:12:12Z
updated: 2026-08-15T07:12:12Z
---

## What to build

Assets come back out, get listed, and go away again. Bytes are served by the api from its own storage at an address that never changes, because the id is the hash; the editor lists what a Workspace holds; and a delete removes the asset outright, with nothing tracking which documents referenced it. That last part is deliberate and already decided: a document referencing a deleted asset fails loudly, and re-uploading the same bytes revives every reference at the same id.

## Acceptance criteria

- [ ] An asset is served with its own content type at an address carrying its Workspace and its id; a suffix on the address is cosmetic and ignored when looking the asset up. Worked example: the same asset fetched with and without the file extension returns the same bytes.
- [ ] Serving is authenticated and cached as immutable and private; no anonymous request receives asset bytes, and no storage URL or credential ever reaches a client.
- [ ] Both list endpoints return that Workspace's records newest first, unpaginated, each with the metadata its kind carries and its serving address; font records report whether they are bundled.
- [ ] Deleting removes the database row first and the stored object second, with no tombstone, so re-uploading the same bytes recreates the asset at the same id and revives every document that referenced it.
- [ ] A bundled font refuses deletion with its own code; every other asset deletes unconditionally, including one that documents or in-flight Generation Jobs reference. Nothing counts references, before or during the delete.
- [ ] The render worker reaches asset bytes through an internal path behind the shared internal credential, taking a Workspace and an asset id — the worker holds no Membership, and the api stays the only thing that reads asset rows or knows storage keys.
- [ ] Deleting is Editor-level; listing and fetching are open to any member of the Workspace; a caller outside it is refused in a way that does not reveal whether the asset exists.
