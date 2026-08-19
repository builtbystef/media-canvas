---
id: t60pvx
title: 'Image Assets: upload with EXIF normalization'
state: done
assignee: claude
priority: high
depends_on:
    - ilgj60
    - sazdn4
    - 92zwes
parent: ek7pq1
created: 2026-08-15T07:12:07Z
updated: 2026-08-19T11:15:39Z
---

## What to build

An image enters the system, and what is stored is what will be rendered. A phone photo carrying an orientation flag is re-encoded upright before anything else happens, its camera and location metadata are dropped, and only then are the bytes hashed — because the id has to name the bytes the worker will later verify. Storing the original would mean every such photo is authored sideways in a wrongly shaped frame.

## Acceptance criteria

- [ ] An uploaded image is normalized before storage: the orientation flag is applied so the stored bytes are upright, and metadata is stripped so camera and location data can never be proxied back out.
- [ ] The asset id is the hash of the stored, normalized bytes, and the recorded width and height are the post-normalization numbers. Worked example: a photo whose orientation flag makes it 4000 by 3000 on disk but upright at 3000 by 4000 is stored upright and recorded as 3000 by 4000.
- [ ] Normalization happens before the duplicate check, so re-uploading the same photo returns the existing record and creates nothing.
- [ ] The format is whatever inspection proves, not what the upload declared. Worked example: a file named as a PNG that parses as JPEG is stored as JPEG with the matching key.
- [ ] PNG, JPEG and WebP are accepted; anything else, a file over the size limit, and an image over the pixel limit are each refused with their own machine-readable code, and nothing is stored. Worked example: a small file that decodes to more pixels than the limit allows is refused for its pixel count, not its size.
- [ ] Image Asset identity is the Workspace together with the hash, matching Font Assets.
- [ ] The original uploaded bytes are not kept anywhere.
- [ ] Uploading is Editor-level in the Workspace; a Viewer is refused.

## Notes

**claude** — 2026-08-17T04:00:56Z

Constants bind verbatim from the closure note on 3ko2p7 (the asset upload pipeline): size and pixel limits, error codes and their messages, and the 422 error envelope. Read that note (beaver show 3ko2p7) before building - do not invent values the decision already fixed.

**claude** — 2026-08-19T10:35:05Z

The image library is already chosen: Pillow, in the api. Node 3ko2p7 item 1 puts image inspection in FastAPI with Pillow (no parity risk and no crossing to the worker, unlike font inspection), and item 2 states the orientation case in Pillow's own terms. Spec ek7pq1 lists it as a named dependency. Add it with 'uv add pillow' inside apps/api - do not shop for an alternative, and do not move this work to the worker.

**claude** — 2026-08-19T11:15:39Z

Built 2026-08-19. POST /api/v1/workspaces/{workspaceId}/images, multipart, Editor-level, 201 with the record or 200 with the one the Workspace already held.

Seam (AFK selection, per the test skill): the HTTP endpoint through the FastAPI test client, against the compose stack's real object storage and Postgres — the outermost seam that can observe every criterion. Nothing about Pillow is faked: the test pictures are built with the library that reads them back, so the normalization claims are made against real files. apps/api/tests/test_images.py, 15 tests.

The order, which is the whole design: size refusal -> open (header only) -> format and pixel refusals -> exif_transpose and re-encode -> hash the NORMALIZED bytes -> dedupe lookup -> put the object -> insert the row. Two files that differ only in the metadata that gets dropped are therefore one asset, which is the test that proves normalization precedes the duplicate check.

Constants bound from 3ko2p7 verbatim: 25 MB, 50 megapixels, codes file_too_large / image_too_many_pixels / unsupported_image_format in the 422 { error: { code, message } } envelope shared with fonts (assets.py). Keys are {workspaceId}/images/{id}.{png|jpg|webp}; identity is the (workspace_id, hash) composite primary key, matching Font Assets. Migration 0006_image_assets.

Three implementation choices the decision record did not fix, for a reviewer:
- Encoder settings. Re-encoding is unavoidable (it is what strips metadata and applies the rotation), so JPEG and WebP are written at quality 95 and PNG at Pillow's default; a second generation is not something a designer can see at that quality.
- 50 megapixels reads as 50,000,000 pixels, the camera-spec meaning of the word.
- Pillow raises DecompressionBombError on open for a header claiming more than ~179 Mpx, before our own limit can be read. That is mapped to image_too_many_pixels rather than becoming a 500, and a hand-built PNG header covers it.

Pillow added to apps/api (uv add pillow) as node 3ko2p7 item 1 and spec ek7pq1 name it.

Discovered work, not done here: an animated WebP is accepted and silently flattened to its first frame — exactly the surprise GIF was refused to avoid, and undecided. Published as ny2muu under the spec.
