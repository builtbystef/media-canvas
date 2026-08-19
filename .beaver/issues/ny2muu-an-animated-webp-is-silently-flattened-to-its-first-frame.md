---
id: ny2muu
title: An animated WebP is silently flattened to its first frame
state: todo
priority: low
parent: ek7pq1
created: 2026-08-19T11:15:16Z
updated: 2026-08-19T11:15:16Z
---

## What is wrong

Node 3ko2p7 item 6 refuses GIF because animation is out of scope project-wide and "a silently-dropped-frames rule is a surprise". It accepts WebP without saying anything about animated WebP — and an animated WebP is exactly that surprise.

Verified against the upload built in t60pvx: a three-frame animated WebP passes inspection (Pillow reports `format == "WEBP"`, `is_animated == True`), normalization re-encodes the first frame only, and the upload succeeds. The uploader is told nothing; the Image Asset is a still.

## What has to be decided

Which of the two, for animated WebP:

- Refuse it, as GIF is refused — a new machine-readable code, or `unsupported_image_format` with prose naming animation, and a message telling the uploader to export a still frame.
- Accept it deliberately, flattened to the first frame, and say so in the response the editor renders.

Nothing in the decision record settles this, so it is a user decision, not an implementation choice.

## Where it lands

`apps/api/src/media_canvas_api/images.py` — `normalized()` already opens the file and knows the format before it decides; `is_animated` is available on the same object. One refusal or one deliberate flatten, plus a test in `apps/api/tests/test_images.py`.
