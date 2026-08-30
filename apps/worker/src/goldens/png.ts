import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type PngImage = { width: number; height: number; data: Uint8Array };

export function writePng(width: number, height: number, data: Uint8Array): Uint8Array {
  if (data.length !== width * height * 4) {
    throw new Error(`RGBA data does not match ${String(width)}×${String(height)}`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    scanlines[dst] = 0; // filter None
    scanlines.set(data.subarray(src, src + width * 4), dst + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function readPng(bytes: Uint8Array): PngImage {
  const file = Buffer.from(bytes);
  if (file.length < 8 || !file.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG");
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  let cursor = 8;
  while (cursor + 12 <= file.length) {
    const length = file.readUInt32BE(cursor);
    const type = file.toString("latin1", cursor + 4, cursor + 8);
    const data = file.subarray(cursor + 8, cursor + 8 + length);
    cursor += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      const interlace = data[12] ?? 0;
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `unsupported PNG: bitDepth ${String(bitDepth)} colorType ${String(colorType)} interlace ${String(interlace)}`,
        );
      }
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }
  if (width === 0 || height === 0) throw new Error("PNG has no IHDR");
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const expected = height * (1 + stride);
  if (raw.length !== expected) {
    throw new Error(`PNG IDAT decoded to ${String(raw.length)} bytes, not ${String(expected)}`);
  }
  const data = new Uint8Array(width * height * 4);
  const prior = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * (1 + stride), (y + 1) * (1 + stride));
    const filter = row[0] ?? 0;
    const recon = unfilter(filter, row.subarray(1), prior, bpp);
    prior.set(recon);
    for (let x = 0; x < width; x++) {
      const src = x * bpp;
      const dst = (y * width + x) * 4;
      data[dst] = recon[src] ?? 0;
      data[dst + 1] = recon[src + 1] ?? 0;
      data[dst + 2] = recon[src + 2] ?? 0;
      data[dst + 3] = bpp === 4 ? (recon[src + 3] ?? 0) : 255;
    }
  }
  return { width, height, data };
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
  return out;
}

function unfilter(filter: number, row: Buffer, prior: Uint8Array, bpp: number): Uint8Array {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) {
    const x = row[i] ?? 0;
    const a = i >= bpp ? (out[i - bpp] ?? 0) : 0;
    const b = prior[i] ?? 0;
    const c = i >= bpp ? (prior[i - bpp] ?? 0) : 0;
    let recon: number;
    switch (filter) {
      case 0:
        recon = x;
        break;
      case 1:
        recon = x + a;
        break;
      case 2:
        recon = x + b;
        break;
      case 3:
        recon = x + ((a + b) >> 1);
        break;
      case 4:
        recon = x + paeth(a, b, c);
        break;
      default:
        throw new Error(`unsupported PNG filter ${String(filter)}`);
    }
    out[i] = recon & 255;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
