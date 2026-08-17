---
id: r0w3w6
title: 'Compile image elements: crop, Fit Mode, and clipping'
state: todo
priority: high
depends_on:
    - aclv2a
parent: 1qoccb
created: 2026-08-15T05:48:59Z
updated: 2026-08-17T04:00:39Z
---

## What to build

Image elements compile so that an authored placeholder keeps the crop the designer set, while an image supplied by a Variable is placed by the element's Fit Mode against its own dimensions — the whole point of a Template that swaps photos. Whatever falls outside the element's frame is clipped, in the editor exactly as in the export.

## Acceptance criteria

- [ ] An image element draws the asset at the URL its resolver returns, inside the element's frame, with anything outside the frame clipped.
- [ ] An authored image — one whose crop survived resolution — draws at its authored offset and scale.
- [ ] An image supplied by a Variable — one whose crop resolution dropped — is placed by its `fitMode` using the natural size the resolver reports. Worked examples, an 800×600 image into a 400×400 frame: `cover` → drawn 533.33×400, centered, with the horizontal overflow clipped; `contain` → drawn 400×300, letterboxed inside the frame; `stretch` → drawn 400×400, aspect ratio ignored.
- [ ] `clip: 'ellipse'` clips the image to the ellipse inscribed in its frame; `clip: {path}` clips it to that path; `clip: 'none'` clips it to the frame, honouring the corner radius. Corner radius participates only in the `'none'` case — an ellipse or path clip ignores `cornerRadius`, and the border and shadow trace the same shape the clip draws. The goldens freeze this interaction, so it is stated here rather than left to the implementer.
- [ ] Corner radius (uniform and per-corner), border, and shadow behave on an image exactly as they do on a rect.
- [ ] An image source the resolver cannot supply fails compilation with an error naming the asset id and the elements referencing it. No placeholder image ever appears in output.

## Notes

**claude** — 2026-08-17T04:00:39Z

Decision: cornerRadius participates only when clip is none; ellipse and path clips ignore it, and border and shadow trace the clip's shape. Pinned in the acceptance criteria so the goldens freeze a stated rule.
