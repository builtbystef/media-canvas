import pixelmatch from "./pixelmatch.js";
import { readPng } from "./png.ts";

export const PIXEL_THRESHOLD = 0.1;

export const WORKER_MAX_DIFF_RATIO = 0;

export const PARITY_MAX_DIFF_RATIO = 0.006;

export type CompareResult = {
  width: number;
  height: number;
  diffPixels: number;
  diffRatio: number;
  passed: boolean;
};

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
