import { expect, test } from "vitest";

import { comparePngs, WORKER_MAX_DIFF_RATIO } from "./compare.ts";
import { readPng, writePng } from "./png.ts";

function solid(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([r, g, b, a], i * 4);
  return data;
}

test("a written PNG is a lossless PNG and reads back the same pixels", () => {
  const pixels = solid(3, 2, 10, 20, 30, 40);
  const bytes = writePng(3, 2, pixels);

  expect(
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ).toBe(true);
  const decoded = readPng(bytes);
  expect(decoded).toEqual({ width: 3, height: 2, data: pixels });
});

test("comparePngs reports a ratio of 0 for identical lossless PNGs", () => {
  const png = writePng(4, 4, solid(4, 4, 1, 2, 3));
  const result = comparePngs(png, png, WORKER_MAX_DIFF_RATIO);
  expect(result.passed).toBe(true);
  expect(result.diffRatio).toBe(0);
});

test("comparePngs fails when the pictures are different sizes", () => {
  const a = writePng(2, 2, solid(2, 2, 0, 0, 0));
  const b = writePng(3, 2, solid(3, 2, 0, 0, 0));
  expect(() => comparePngs(a, b, WORKER_MAX_DIFF_RATIO)).toThrow(/different size/i);
});
