---
id: ny2muu
title: An animated WebP is silently flattened to its first frame
state: done
assignee: agent
priority: low
parent: ek7pq1
created: 2026-08-19T11:15:16Z
updated: 2026-08-29T08:31:35Z
---

## What to build

Animated WebP is refused at upload, the same way GIF is. Animation is out of scope project-wide; a silently flattened first frame is the surprise node 3ko2p7 item 6 already rejected for GIF.

`normalized()` already opens the file and knows the format before it decides; Pillow's `is_animated` is available on the same object. The refusal lands there. A still WebP is unchanged.

## Acceptance criteria

- [ ] An animated WebP is refused with 422 `{ error: { code, message } }` and nothing is stored.
- [ ] The code is `unsupported_image_format` — not a new code. The editor already renders that code by showing the server message; a new code would pull this issue into the editor.
- [ ] The message names animation and tells the uploader to export a still frame as PNG, JPEG or WebP. It is not the generic "Only PNG, JPEG and WebP" sentence, which would claim WebP itself is unsupported.
- [ ] A still (non-animated) WebP continues to be accepted.
- [ ] GIF refusal is unchanged: same code, same generic message.

## Where it lands

`apps/api/src/media_canvas_api/images.py` (`normalized()`) and a test in `apps/api/tests/test_images.py`.

## Notes

**agent** — 2026-08-29T06:26:31Z

Decided 2026-08-29: refuse animated WebP, as GIF is refused. Reuse unsupported_image_format (no new code) with prose that names animation and tells the uploader to export a still frame. Flattening — even announced — stores bytes that are not what was uploaded, under a content-addressed id. A new code was rejected because this issue's landing zone is the API; the editor already shows the server message for unsupported_image_format.

**agent** — 2026-08-29T08:31:35Z

Refused animated WebP in normalized() after the format check, reusing unsupported_image_format. Message: "Animated WebP cannot be used. Export a still frame as PNG, JPEG or WebP." Still WebP is unchanged (is_animated is false). GIF is unchanged because the format gate runs first and still uses the generic Only-PNG-JPEG-and-WebP sentence. Pillow sets is_animated as a plugin attribute, so the check is getattr(opened, "is_animated", False). Seam: FastAPI upload endpoint in tests/test_images.py — the spec's FastAPI seam and the issue's named landing.
