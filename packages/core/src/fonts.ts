// What a font file says about itself, read with the compiler's own parser.
//
// The gate an uploaded Font Asset passes is this one, deliberately: a file
// that some other font library would take but this parser cannot read is
// exactly the asset that would hard-error mid-render, so the only judge worth
// having is the parser that will later measure every line of text in it.

import type { Font } from "opentype.js";
import { parse as parseFont } from "opentype.js";

/** The two file formats a Font Asset is ever stored as. */
export type FontFormat = "ttf" | "otf";

/** What one readable font file says about itself. Everything but `format` and
 *  `variable` is display metadata — the font picker groups faces by it, and
 *  nothing in the render path reads it. */
export type FontFacts = {
  format: FontFormat;
  family: string;
  subfamily: string;
  /** The CSS weight the file declares: 400 regular, 700 bold, 900 black. */
  weight: number;
  italic: boolean;
  postScriptName: string;
  /** Whether the file carries variation axes. Metrics taken off such a file's
   *  default instance are unreliable, so an uploader is refused one. */
  variable: boolean;
};

/** Why a file is no Font Asset: it is not one of the two formats at all, or it
 *  is one and the parser could not read it. */
export type FontProblem = "unsupported_format" | "unparseable_font";

/** What the parser makes of a file. A file it cannot read is an answer rather
 *  than a failure — the caller turns it into the refusal a user reads. */
export type FontInspection =
  | { readable: true; font: FontFacts }
  | { readable: false; problem: FontProblem };

// The sfnt version tags a file may open with. TrueType outlines are `1.0` —
// or the older Macintosh `true` — and CFF outlines are `OTTO`. Everything
// else a font file can start with, WOFF and WOFF2 included, is a format this
// product does not take.
const TRUETYPE = 0x00_01_00_00;
const TRUE = 0x74_72_75_65;
const OTTO = 0x4f_54_54_4f;

/** The format the bytes declare, or nothing when they declare neither. */
export function fontFormatOf(bytes: ArrayBuffer): FontFormat | undefined {
  if (bytes.byteLength < 4) return undefined;
  const tag = new DataView(bytes).getUint32(0);
  if (tag === TRUETYPE || tag === TRUE) return "ttf";
  if (tag === OTTO) return "otf";
  return undefined;
}

/** Read a font file with the parser the compiler uses, and report what it is. */
export function inspectFont(bytes: ArrayBuffer): FontInspection {
  const format = fontFormatOf(bytes);
  if (format === undefined) return { readable: false, problem: "unsupported_format" };
  let font: Font;
  try {
    font = parseFont(bytes);
  } catch {
    // Whatever the parser complained about, the file is one this product
    // cannot draw with; the reason it gives is opentype's own wording and is
    // no use to somebody choosing another file.
    return { readable: false, problem: "unparseable_font" };
  }
  return {
    readable: true,
    font: {
      format,
      family: font.getEnglishName("fontFamily"),
      subfamily: font.getEnglishName("fontSubfamily"),
      weight: weightOf(font),
      italic: isItalic(font),
      postScriptName: font.getEnglishName("postScriptName"),
      variable: font.tables.fvar !== undefined,
    },
  };
}

/** The weight the OS/2 table declares. A file without that table declares
 *  none, and regular is what a renderer would assume of it anyway. */
function weightOf(font: Font): number {
  const declared: unknown = font.tables.os2?.usWeightClass;
  return typeof declared === "number" ? declared : 400;
}

/** Italic as the file itself claims it: the OS/2 selection bit, or — for a
 *  file with no OS/2 table — the `head` table's own style bit. Neither is the
 *  italic angle, which a slanted-but-upright face can also carry. */
function isItalic(font: Font): boolean {
  const selection: unknown = font.tables.os2?.fsSelection;
  if (typeof selection === "number") return (selection & 0x01) !== 0;
  const style: unknown = font.tables.head?.macStyle;
  return typeof style === "number" && (style & 0x02) !== 0;
}
