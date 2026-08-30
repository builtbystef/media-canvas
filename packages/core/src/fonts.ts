import type { Font } from "opentype.js";
import { parse as parseFont } from "opentype.js";

export type FontFormat = "ttf" | "otf";

export type FontFacts = {
  format: FontFormat;
  family: string;
  subfamily: string;
  weight: number;
  italic: boolean;
  postScriptName: string;
  variable: boolean;
};

export type FontProblem = "unsupported_format" | "unparseable_font";

export type FontInspection =
  | { readable: true; font: FontFacts }
  | { readable: false; problem: FontProblem };

const TRUETYPE = 0x00_01_00_00;
const TRUE = 0x74_72_75_65;
const OTTO = 0x4f_54_54_4f;

export function fontFormatOf(bytes: ArrayBuffer): FontFormat | undefined {
  if (bytes.byteLength < 4) return undefined;
  const tag = new DataView(bytes).getUint32(0);
  if (tag === TRUETYPE || tag === TRUE) return "ttf";
  if (tag === OTTO) return "otf";
  return undefined;
}

export function inspectFont(bytes: ArrayBuffer): FontInspection {
  const format = fontFormatOf(bytes);
  if (format === undefined) return { readable: false, problem: "unsupported_format" };
  let font: Font;
  try {
    font = parseFont(bytes);
  } catch {
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

function weightOf(font: Font): number {
  const declared: unknown = font.tables.os2?.usWeightClass;
  return typeof declared === "number" ? declared : 400;
}

function isItalic(font: Font): boolean {
  const selection: unknown = font.tables.os2?.fsSelection;
  if (typeof selection === "number") return (selection & 0x01) !== 0;
  const style: unknown = font.tables.head?.macStyle;
  return typeof style === "number" && (style & 0x02) !== 0;
}
