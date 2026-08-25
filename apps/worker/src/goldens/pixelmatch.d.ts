/** pixelmatch 7.2.0. See pixelmatch.js. */
export default function pixelmatch(
  img1: Uint8Array | Uint8ClampedArray,
  img2: Uint8Array | Uint8ClampedArray,
  output: Uint8Array | Uint8ClampedArray | void,
  width: number,
  height: number,
  options?: {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
    checkerboard?: boolean;
  },
): number;
