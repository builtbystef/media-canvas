---
id: r0w3w6
title: 'Compile image elements: crop, Fit Mode, and clipping'
state: done
assignee: claude
priority: high
depends_on:
    - aclv2a
parent: 1qoccb
created: 2026-08-15T05:48:59Z
updated: 2026-08-19T00:39:34Z
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

**claude** — 2026-08-19T00:39:34Z

Image elements compile in packages/core/src/compile.ts, tested at the compile seam in compile.test.ts (13 tests).

What was built: an <image> placed by its authored crop when one survived resolution (frame origin + offsetX/offsetY, the document's naturalWidth/naturalHeight times scale), and by fitMode against AssetResolver.imageSize when the crop was dropped — cover/contain centred, stretch the frame itself, all with preserveAspectRatio="none" so SVG has no fitting left to do. Every image carries a clipPath: the frame rounded by cornerRadius for clip 'none' (uniform stays a <rect rx>, per-corner becomes the same path a rect compiles to), the inscribed ellipse for 'ellipse', the authored path for {path}. Rotation, opacity, and shadow ride on the shared wrap() that every other element uses.

Decisions a reviewer needs:

1. A {path} clip is authored in the element's own coordinates and drawn from the frame's origin (translate(x y)), the convention a vector element's path already follows. The schema gives a clip path no viewBox, so it is not scaled; a canvas-coordinate path would not travel with the element.
2. The path clip is the whole clip — the frame does not cut it a second time. 'none' and 'ellipse' are inside the frame by construction.
3. The border is drawn beside the clipped image, not inside the clip: a stroke is centred on its edge, so clipping it would shave off its outer half. It traces the clip's own shape, so an ellipse or path clip never shows a rounded-rect outline.
4. The shadow is cast by the wrapper holding the image and its border, i.e. by what is actually painted — for an opaque image filling its frame that is exactly the shape the clip draws. Two consequences worth knowing before the goldens are baked: an image with its own alpha casts a shadow shaped by its artwork, and a 'contain' fit casts one shaped by the letterboxed image rather than by the frame. Both are what a rect does with its own painted alpha, and painting a frame-shaped silhouette to shadow instead would show through wherever the image does not cover.
5. Missing assets: the resolver is consulted once per Image Asset in a prepass before anything is drawn, and every id it cannot supply is reported in one error naming the id and the elements referencing it — the shape loadFonts already had, now factored into a shared loadAssets() used by both. imageSize is asked only for elements that lost their crop and do not stretch. Nothing is drawn in place of a missing image.
6. An image the resolver reports no extent for compiles to an empty box, mirroring the vector element's zero-viewBox case.
7. compile's Context no longer holds the AssetResolver: fonts and images are both taken up front, so nothing reaches for an asset mid-draw.

Checks: pnpm check, pnpm test (103 TS + 64 py), and pnpm build all pass; no generated-client drift.
