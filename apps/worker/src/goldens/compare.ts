// The golden comparator (issue 6bqdxe): pixelmatch at threshold 0.1, then a
// differing-pixel *ratio* against the fixture's allowance. Worker-output
// goldens allow none. The named cross-flavor parity fixture is the only one
// that allows 0.006 — the prototype's 0.534% glyph-edge drift plus a sliver
// of headroom, and not enough for a line of text to move or a fill to change.

import pixelmatch from "./pixelmatch.js";
import { readPng } from "./png.ts";

/** Per-pixel YIQ distance. Explicit: pixelmatch's default is also 0.1, but
 *  the spec names the value so a default change cannot move the contract. */
export const PIXEL_THRESHOLD = 0.1;

/** Worker-output goldens: zero differing pixels, as a ratio so the rule does
 *  not care how big the canvas is. */
export const WORKER_MAX_DIFF_RATIO = 0;

/** The one nonzero allowance: full Chromium vs chrome-headless-shell, both
 *  inside the pinned image. */
export const PARITY_MAX_DIFF_RATIO = 0.006;

export type CompareResult = {
  width: number;
  height: number;
  diffPixels: number;
  diffRatio: number;
  passed: boolean;
};

/** Compare two same-size RGBA buffers. A size mismatch is not a ratio — it
 *  is a different picture — and fails before pixelmatch runs. */
export function compareRgba(
  actual: Uint8Array,
  expected: Uint8Array,
  width: number,
  height: number,
  maxDiffPixelRatio: number,
): CompareResult {
  const pixels = width * height;
  if (actual.length !== pixels * 4 || expected.length !== pixels * 4) {
    throw new Error(
      `image data does not match ${String(width)}×${String(height)}: ` +
        `actual ${String(actual.length)} bytes, expected ${String(expected.length)} bytes`,
    );
  }

  // checkerboard: false matches the pre-v7 blend (plain white) the 0.006
  // tolerance was calibrated against. v7's default checkerboard would move
  // that measurement for any pixel that carries alpha.
  const diffPixels = pixelmatch(actual, expected, undefined, width, height, {
    threshold: PIXEL_THRESHOLD,
    checkerboard: false,
  });
  const diffRatio = pixels === 0 ? 0 : diffPixels / pixels;
  return {
    width,
    height,
    diffPixels,
    diffRatio,
    passed: diffRatio <= maxDiffPixelRatio,
  };
}

/** Compare two PNG files. Different pixel dimensions fail before the
 *  ratio is considered — a 2× export is not a drifted 1× export. */
export function comparePngs(
  actual: Uint8Array,
  expected: Uint8Array,
  maxDiffPixelRatio: number,
): CompareResult {
  const got = readPng(actual);
  const want = readPng(expected);
  if (got.width !== want.width || got.height !== want.height) {
    throw new Error(
      `PNGs are different sizes: actual ${String(got.width)}×${String(got.height)}, ` +
        `expected ${String(want.width)}×${String(want.height)}`,
    );
  }
  return compareRgba(got.data, want.data, got.width, got.height, maxDiffPixelRatio);
}
