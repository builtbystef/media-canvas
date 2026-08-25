import { expect, test } from "vitest";

import {
  compareRgba,
  PARITY_MAX_DIFF_RATIO,
  PIXEL_THRESHOLD,
  WORKER_MAX_DIFF_RATIO,
} from "./compare.ts";

/** A solid RGBA buffer, one colour. */
function solid(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([r, g, b, a], i * 4);
  }
  return data;
}

/** Paint a rectangle of pixels a different colour, in place. */
function fill(
  data: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
}

test("the comparator uses pixelmatch at threshold 0.1", () => {
  expect(PIXEL_THRESHOLD).toBe(0.1);
});

test("identical images pass a worker golden: a ratio of 0, not a count", () => {
  const img = solid(10, 10, 255, 0, 0);
  const result = compareRgba(img, img.slice(), 10, 10, WORKER_MAX_DIFF_RATIO);

  expect(WORKER_MAX_DIFF_RATIO).toBe(0);
  expect(result.passed).toBe(true);
  expect(result.diffPixels).toBe(0);
  expect(result.diffRatio).toBe(0);
});

test("one differing pixel fails a worker golden, because the ratio is not 0", () => {
  const expected = solid(10, 10, 255, 0, 0);
  const actual = expected.slice();
  fill(actual, 10, 0, 0, 1, 1, 0, 0, 255);
  const result = compareRgba(actual, expected, 10, 10, WORKER_MAX_DIFF_RATIO);

  expect(result.passed).toBe(false);
  expect(result.diffPixels).toBe(1);
  expect(result.diffRatio).toBe(0.01);
});

test("the parity fixture allows a 0.534% glyph-edge drift and rejects a layout shift or a fill change", () => {
  // 100×100 = 10,000 pixels. 53 differing pixels is 0.530%, under 0.006;
  // that is the prototype's 0.534% worked example, scaled to this canvas.
  const expected = solid(100, 100, 240, 240, 240);
  const glyphEdge = expected.slice();
  fill(glyphEdge, 100, 0, 0, 53, 1, 16, 16, 16);
  const glyph = compareRgba(glyphEdge, expected, 100, 100, PARITY_MAX_DIFF_RATIO);
  expect(PARITY_MAX_DIFF_RATIO).toBe(0.006);
  expect(glyph.diffRatio).toBeCloseTo(0.0053);
  expect(glyph.passed).toBe(true);

  // A one-line layout shift: a whole 100-pixel row moved. 1% > 0.006.
  const shifted = expected.slice();
  fill(shifted, 100, 0, 10, 100, 11, 16, 16, 16);
  const layout = compareRgba(shifted, expected, 100, 100, PARITY_MAX_DIFF_RATIO);
  expect(layout.diffRatio).toBe(0.01);
  expect(layout.passed).toBe(false);

  // A changed fill colour paints every pixel. That is not glyph-edge AA.
  const recolored = solid(100, 100, 0, 80, 255);
  const fillChange = compareRgba(recolored, expected, 100, 100, PARITY_MAX_DIFF_RATIO);
  expect(fillChange.diffRatio).toBe(1);
  expect(fillChange.passed).toBe(false);
});
