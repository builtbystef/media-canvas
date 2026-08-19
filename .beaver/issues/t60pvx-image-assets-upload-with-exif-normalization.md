---
id: t60pvx
title: 'Image Assets: upload with EXIF normalization'
state: todo
priority: high
depends_on:
    - ilgj60
    - sazdn4
    - 92zwes
parent: ek7pq1
created: 2026-08-15T07:12:07Z
updated: 2026-08-19T10:35:05Z
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
