import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse } from "opentype.js";
import { expect, test } from "vitest";

import type { BundledFont, FontStyle } from "./index.ts";
import { bundledFonts, bundledFontPath, bundledFontsDirectory } from "./index.ts";

/** The set the product ships (node oxcf2v), written out here so that losing a
 *  file — or quietly gaining one — fails rather than passes. */
const BUNDLED_SET: Record<string, [number, FontStyle][]> = {
  Inter: [
    [400, "normal"],
    [400, "italic"],
    [700, "normal"],
    [700, "italic"],
  ],
  Montserrat: [
    [400, "normal"],
    [700, "normal"],
    [900, "normal"],
  ],
  Lora: [
    [400, "normal"],
    [400, "italic"],
    [700, "normal"],
  ],
  "Playfair Display": [
    [400, "normal"],
    [700, "normal"],
    [900, "normal"],
  ],
  Oswald: [
    [400, "normal"],
    [700, "normal"],
  ],
  "Bebas Neue": [[400, "normal"]],
  Pacifico: [[400, "normal"]],
  "Dancing Script": [
    [400, "normal"],
    [700, "normal"],
  ],
  "JetBrains Mono": [
    [400, "normal"],
    [700, "normal"],
  ],
};

/** Every font file under the bundled directory, as `family-dir/file` paths. */
function vendoredFiles(): string[] {
  const found: string[] = [];
  for (const familyDir of readdirSync(bundledFontsDirectory, { withFileTypes: true })) {
    if (!familyDir.isDirectory()) continue;
    for (const entry of readdirSync(join(bundledFontsDirectory, familyDir.name))) {
      if (/\.(?:ttf|otf)$/i.test(entry)) found.push(`${familyDir.name}/${entry}`);
    }
  }
  return found.sort();
}

function bytesOf(font: BundledFont): Buffer {
  return readFileSync(bundledFontPath(font));
}

/** The sfnt header: the four-byte version tag, and the table tags it lists. */
function sfnt(bytes: Buffer): { version: string; tables: string[] } {
  const version = bytes.readUInt32BE(0) === 0x00010000 ? "ttf" : bytes.toString("latin1", 0, 4);
  const tables = Array.from({ length: bytes.readUInt16BE(4) }, (_, index) =>
    bytes.toString("latin1", 12 + index * 16, 16 + index * 16),
  );
  return { version, tables };
}

test("the manifest lists exactly the bundled set, family by family", () => {
  const listed: Record<string, [number, FontStyle][]> = {};
  for (const font of bundledFonts) {
    (listed[font.family] ??= []).push([font.weight, font.style]);
  }
  expect(listed).toEqual(BUNDLED_SET);
});

test("every manifest id is the SHA-256 of that file's bytes", () => {
  for (const font of bundledFonts) {
    const digest = createHash("sha256").update(bytesOf(font)).digest("hex");
    expect(digest, `${font.file} has changed since its id was written`).toBe(font.id);
  }
});

test("the manifest and the vendored files name each other exactly", () => {
  expect([...bundledFonts].map((font) => font.file).sort()).toEqual(vendoredFiles());
  expect(new Set(bundledFonts.map((font) => font.id)).size).toBe(bundledFonts.length);
});

test("every vendored file parses and exposes a .notdef glyph", () => {
  for (const font of bundledFonts) {
    const bytes = bytesOf(font);
    const parsed = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    expect(parsed.glyphs.get(0).name, `${font.file} glyph 0`).toBe(".notdef");
    // A character no font in this set maps: the missing-glyph rule resolves it
    // to .notdef rather than to nothing.
    expect(parsed.charToGlyphIndex("\u{10FFFD}"), `${font.file} missing glyph`).toBe(0);
  }
});

test("no vendored file is a variable font, and every one is TTF or OTF", () => {
  for (const font of bundledFonts) {
    const { version, tables } = sfnt(bytesOf(font));
    expect(tables, `${font.file} is a variable font`).not.toContain("fvar");
    expect(["ttf", "true", "OTTO"], `${font.file} is not TTF or OTF`).toContain(version);
  }
});

test("every bundled family ships its SIL OFL license text", () => {
  const families = new Set(bundledFonts.map((font) => dirname(font.file)));
  expect(families.size).toBe(Object.keys(BUNDLED_SET).length);
  for (const family of families) {
    const license = readFileSync(join(bundledFontsDirectory, family, "OFL.txt"), "utf8");
    expect(license, `${family}/OFL.txt`).toContain("SIL OPEN FONT LICENSE Version 1.1");
  }
});
