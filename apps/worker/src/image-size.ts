export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  return pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return undefined;
  return { width, height };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    const marker = bytes[i + 1];
    if (marker === undefined) return undefined;
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
      const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
      if (width === 0 || height === 0) return undefined;
      return { width, height };
    }
    if (length < 2) return undefined;
    i += 2 + length;
  }
  return undefined;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 30) return undefined;
  const tag = (start: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (tag(0, 4) !== "RIFF" || tag(8, 4) !== "WEBP") return undefined;
  const kind = tag(12, 4);
  if (kind === "VP8X") {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return { width, height };
  }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = (bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8);
    const height = (bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8);
    return { width: width & 0x3fff, height: height & 0x3fff };
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const bits =
      (bytes[21] ?? 0) |
      ((bytes[22] ?? 0) << 8) |
      ((bytes[23] ?? 0) << 16) |
      ((bytes[24] ?? 0) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}
