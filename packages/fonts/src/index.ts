// The bundled font set (node oxcf2v): nine SIL OFL families vendored in the
// repository, each file a Font Asset whose id is the SHA-256 of its bytes.
// The manifest is the one place a file's id, family, weight, and style are
// written down — the compiler's metrics, the worker's font configuration, the
// golden fixtures, and Workspace seeding all read it instead of guessing at
// file names.
//
// Node only: the manifest and the font bytes are read from disk. The browser
// receives fonts as Font Assets served by the api, never from this package.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The two styles a bundled file carries. Bold is a weight rather than a
 *  style: every weight and every italic is its own file, so no renderer ever
 *  synthesizes one from another. */
export type FontStyle = "normal" | "italic";

/** One vendored font file, as the manifest describes it. */
export type BundledFont = {
  /** The Font Asset id: the SHA-256 of the file's bytes, lowercase hex. */
  id: string;
  /** The file's path within the bundled font directory. */
  file: string;
  /** Display metadata for the font picker — the id is the identity. */
  family: string;
  /** CSS weight of this file: 400 regular, 700 bold, 900 black. */
  weight: number;
  style: FontStyle;
  /** Names read from the file by the render path's font parser. */
  subfamily: string;
  postScriptName: string;
};

const packageRoot = join(import.meta.dirname, "..");

/** The directory holding the vendored files and their license texts. */
export const bundledFontsDirectory = join(packageRoot, "files");

const manifest = JSON.parse(readFileSync(join(packageRoot, "manifest.json"), "utf8")) as {
  fonts: BundledFont[];
};

/** Every bundled file, ordered as a font picker would list them. */
export const bundledFonts: readonly BundledFont[] = manifest.fonts;

/** The absolute path of one bundled file. */
export function bundledFontPath(font: BundledFont): string {
  return join(bundledFontsDirectory, font.file);
}

/** One bundled file's bytes, as the buffer every reader of a Font Asset takes:
 *  the compiler parses one for metrics and inlines one into compiled markup,
 *  and Workspace seeding uploads one. */
export function bundledFontBytes(font: BundledFont): ArrayBuffer {
  const bytes = readFileSync(bundledFontPath(font));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
