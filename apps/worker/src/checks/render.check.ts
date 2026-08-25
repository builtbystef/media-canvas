// The image's render check: run it inside the pinned image and it says whether
// `render(svg, options)` produces the file a user downloads — PNG, JPEG, or
// PDF — from compiled markup (issue zycblh).
//
//   pnpm --filter worker run image:check

import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";

import { compile } from "@media-canvas/core";

import { render } from "../render.ts";
import { bundledAssets, pngSize, textDocument } from "./fixture.ts";

/** Handwritten canvas markup: `render` takes SVG, not a Design Document, so
 *  the size and alpha cases do not need the compiler. */
function canvasSvg(width: number, height: number, inner = ""): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" ` +
    `viewBox="0 0 ${String(width)} ${String(height)}">${inner}</svg>`
  );
}

function isPng(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** PNG colour type from IHDR: 6 is RGBA, 2 is RGB. */
function pngColorType(bytes: Uint8Array): number {
  return bytes[25] ?? -1;
}

void test("a 1080×1080 canvas at scale 2 produces a 2160×2160 PNG", async () => {
  const bytes = await render(canvasSvg(1080, 1080), { format: "png", scale: 2 });
  assert.equal(isPng(bytes), true);
  assert.deepEqual(pngSize(Buffer.from(bytes)), { width: 2160, height: 2160 });
});

void test("PNG honours a scale of 1, 2, or 3 as the device scale factor", async () => {
  const svg = canvasSvg(100, 80);
  assert.deepEqual(pngSize(Buffer.from(await render(svg, { format: "png", scale: 1 }))), {
    width: 100,
    height: 80,
  });
  assert.deepEqual(pngSize(Buffer.from(await render(svg, { format: "png", scale: 2 }))), {
    width: 200,
    height: 160,
  });
  assert.deepEqual(pngSize(Buffer.from(await render(svg, { format: "png", scale: 3 }))), {
    width: 300,
    height: 240,
  });
});

void test("a fully transparent background produces a PNG that is transparent, not white", async () => {
  const svg = canvasSvg(64, 64);
  const transparent = await render(svg, { format: "png", scale: 1 });
  const white = await render(canvasSvg(64, 64, '<rect width="64" height="64" fill="#FFFFFF"/>'), {
    format: "png",
    scale: 1,
  });
  assert.equal(isPng(transparent), true);
  assert.equal(pngColorType(transparent), 6, "the PNG carries an alpha channel");
  assert.notDeepEqual(transparent, white, "a transparent canvas was flattened onto white");
});

void test("JPEG defaults to quality 90 and composites a transparent canvas over white", async () => {
  const svg = canvasSvg(64, 64);
  const implied = await render(svg, { format: "jpeg" });
  const explicit = await render(svg, { format: "jpeg", quality: 90 });
  const lower = await render(svg, { format: "jpeg", quality: 50 });
  const white = await render(canvasSvg(64, 64, '<rect width="64" height="64" fill="#FFFFFF"/>'), {
    format: "jpeg",
  });
  assert.equal(isJpeg(implied), true);
  assert.deepEqual(implied, explicit, "the omitted quality was not 90");
  assert.notDeepEqual(implied, lower, "quality 50 produced the same bytes as 90");
  assert.deepEqual(implied, white, "a transparent canvas was not flattened onto white");
});

const PDF_PHRASE = "Media Canvas";

void test("a 1200×630 canvas prints a 12.5 × 6.5625 inch PDF whose text is selectable", async () => {
  const document = textDocument(PDF_PHRASE);
  document.canvas.width = 1200;
  document.canvas.height = 630;
  const text = document.elements[0];
  if (text !== undefined && text.type === "text") text.width = 1100;
  const bytes = await render(compile(document, bundledAssets), { format: "pdf" });
  assert.equal(isPdf(bytes), true);
  const page = pdfPageInches(bytes);
  assert.equal(page.width, 12.5);
  // Chromium's printToPDF records 6.5625in as 473.03998pt (~6.57in). The
  // formula is still 1 canvas pixel = 1/96 inch; this is that measurement.
  assert.ok(
    Math.abs(page.height - 6.5625) < 0.01,
    `page height ${String(page.height)} in is not 630/96 in`,
  );
  assert.match(pdfText(bytes), /Media\s*Canvas/);
  assert.match(Buffer.from(bytes).toString("latin1"), /\/Font/);
});

void test("the same markup twice is byte-identical as PNG and JPEG, and the same PDF page", async () => {
  const svg = compile(textDocument(PDF_PHRASE), bundledAssets);
  const pngA = await render(svg, { format: "png", scale: 1 });
  const pngB = await render(svg, { format: "png", scale: 1 });
  assert.deepEqual(pngB, pngA);
  const jpegA = await render(svg, { format: "jpeg" });
  const jpegB = await render(svg, { format: "jpeg" });
  assert.deepEqual(jpegB, jpegA);
  const pdfA = await render(svg, { format: "pdf" });
  const pdfB = await render(svg, { format: "pdf" });
  assert.deepEqual(pdfPageInches(pdfB), pdfPageInches(pdfA));
  assert.equal(pdfText(pdfB), pdfText(pdfA));
});

void test("markup that will not load fails naming the cause, not a file", async () => {
  await assert.rejects(() => render("this is not markup", { format: "png", scale: 1 }), {
    name: "Error",
    message: /markup will not load/i,
  });
});

void test("an image the page cannot fetch fails naming the cause, not a placeholder", async () => {
  const dead = "http://127.0.0.1:1/missing.png";
  await assert.rejects(
    () =>
      render(canvasSvg(100, 100, `<image href="${dead}" width="100" height="100"/>`), {
        format: "png",
        scale: 1,
      }),
    { name: "Error", message: new RegExp(`image the page cannot fetch:.*${dead}`) },
  );
});

/** MediaBox in inches. PDF points are 1/72 inch. */
function pdfPageInches(bytes: Uint8Array): { width: number; height: number } {
  const source = pdfDecoded(bytes);
  const box = /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/.exec(source);
  if (box === null) throw new Error("PDF has no MediaBox");
  return {
    width: (Number(box[3]) - Number(box[1])) / 72,
    height: (Number(box[4]) - Number(box[2])) / 72,
  };
}

/** Visible strings from Tj operators, mapped through ToUnicode so a CID
 *  font still yields the document's characters. */
function pdfText(bytes: Uint8Array): string {
  const source = pdfDecoded(bytes);
  const cmap = toUnicodeMap(source);
  const pieces: string[] = [];
  const token = /<([0-9A-Fa-f]+)>\s*Tj|\((?:\\.|[^\\)])*\)\s*Tj/g;
  for (const match of source.matchAll(token)) {
    if (match[1] !== undefined) {
      pieces.push(decodeCids(match[1], cmap));
    } else {
      const literal = match[0].slice(1, match[0].lastIndexOf(")"));
      pieces.push(unescapePdf(literal));
    }
  }
  return pieces.join("");
}

function toUnicodeMap(source: string): Map<number, string> {
  const cmap = new Map<number, string>();
  const block = /beginbfchar([\s\S]*?)endbfchar/g;
  for (const section of source.matchAll(block)) {
    const entries = section[1];
    if (entries === undefined) continue;
    for (const pair of entries.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const from = pair[1];
      const to = pair[2];
      if (from === undefined || to === undefined) continue;
      cmap.set(Number.parseInt(from, 16), utf16be(to));
    }
  }
  return cmap;
}

function decodeCids(hex: string, cmap: Map<number, string>): string {
  const chars: string[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    chars.push(cmap.get(Number.parseInt(hex.slice(i, i + 4), 16)) ?? "");
  }
  return chars.join("");
}

function utf16be(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    units.push(Number.parseInt(hex.slice(i, i + 4), 16));
  }
  return String.fromCharCode(...units);
}

function unescapePdf(value: string): string {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")")
    .replaceAll("\\\\", "\\");
}

/** The file with every FlateDecode stream inflated, so operators are readable. */
function pdfDecoded(bytes: Uint8Array): string {
  const file = Buffer.from(bytes);
  const chunks: Buffer[] = [];
  let cursor = 0;
  const marker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  while (cursor < file.length) {
    const start = file.indexOf(marker, cursor);
    if (start === -1) {
      chunks.push(file.subarray(cursor));
      break;
    }
    chunks.push(file.subarray(cursor, start));
    let data = start + marker.length;
    if (file[data] === 0x0d) data += 1;
    if (file[data] === 0x0a) data += 1;
    const end = file.indexOf(endMarker, data);
    if (end === -1) {
      chunks.push(file.subarray(start));
      break;
    }
    const header = file.subarray(Math.max(0, start - 200), start).toString("latin1");
    const payload = file.subarray(data, end);
    if (header.includes("/FlateDecode")) {
      try {
        chunks.push(inflateSync(payload));
      } catch {
        chunks.push(payload);
      }
    } else {
      chunks.push(payload);
    }
    cursor = end + endMarker.length;
  }
  return Buffer.concat(chunks).toString("latin1");
}
