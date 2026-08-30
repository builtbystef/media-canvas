import { readFileSync } from "node:fs";
import { join } from "node:path";

export type FontStyle = "normal" | "italic";

export type BundledFont = {
  id: string;
  file: string;
  family: string;
  weight: number;
  style: FontStyle;
  subfamily: string;
  postScriptName: string;
};

const packageRoot = join(import.meta.dirname, "..");

export const bundledFontsDirectory = join(packageRoot, "files");

const manifest = JSON.parse(readFileSync(join(packageRoot, "manifest.json"), "utf8")) as {
  fonts: BundledFont[];
};

export const bundledFonts: readonly BundledFont[] = manifest.fonts;

export function bundledFontPath(font: BundledFont): string {
  return join(bundledFontsDirectory, font.file);
}

export function bundledFontBytes(font: BundledFont): ArrayBuffer {
  const bytes = readFileSync(bundledFontPath(font));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
