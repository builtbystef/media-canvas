import type { Font, RenderOptions } from "opentype.js";
import { parse as parseFont } from "opentype.js";

import type { TextElement } from "./document.ts";

export type TextPiece = {
  x: number;
  width: number;
  text: string;
  missing: boolean;
};

export type TextLine = {
  baseline: number;
  x: number;
  width: number;
  pieces: TextPiece[];
  start: number;
  end: number;
  positions: number[];
};

export type TextCaretLayout = {
  lines: Array<{ start: number; end: number; baselineY: number }>;
  positions: number[];
  top: number;
  ascent: number;
  lineBoxHeight: number;
};

export type TextLayout = {
  lines: TextLine[];
  top: number;
  height: number;
  ascent: number;
  descent: number;
};

function normalize(content: string): string {
  return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\t", " ");
}

function renderOptions(fontSize: number, letterSpacing: number): RenderOptions {
  return { kerning: true, letterSpacing: fontSize === 0 ? 0 : letterSpacing / fontSize };
}

function runWidth(font: Font, text: string, element: TextElement): number {
  let glyphs = 0;
  const end = font.forEachGlyph(
    text,
    0,
    0,
    element.fontSize,
    renderOptions(element.fontSize, element.letterSpacing),
    () => {
      glyphs += 1;
    },
  );
  return glyphs === 0 ? 0 : end - element.letterSpacing;
}

function notdefWidth(font: Font, fontSize: number): number {
  return ((font.glyphs.get(0).advanceWidth ?? 0) / font.unitsPerEm) * fontSize;
}

function coverageRuns(font: Font, text: string): { text: string; missing: boolean }[] {
  const runs: { text: string; missing: boolean }[] = [];
  for (const character of text) {
    const missing = font.charToGlyphIndex(character) === 0;
    const last = runs.at(-1);
    if (last && !last.missing && !missing) last.text += character;
    else runs.push({ text: character, missing });
  }
  return runs;
}

function layoutLine(
  font: Font,
  text: string,
  element: TextElement,
): { pieces: TextPiece[]; width: number } {
  const pieces: TextPiece[] = [];
  let x = 0;
  for (const run of coverageRuns(font, text)) {
    if (pieces.length > 0) x += element.letterSpacing;
    const width = run.missing
      ? notdefWidth(font, element.fontSize)
      : runWidth(font, run.text, element);
    pieces.push({ x, width, text: run.text, missing: run.missing });
    x += width;
  }
  return { pieces, width: x };
}

type BrokenLine = { text: string; start: number; end: number };

function wrapParagraph(
  paragraph: string,
  origin: number,
  measure: (text: string) => number,
  width: number,
): BrokenLine[] {
  const broken: BrokenLine[] = [];
  let line = "";
  let lineStart = origin;
  const emit = (text: string, start: number): BrokenLine => ({
    text,
    start,
    end: start + text.length,
  });
  const placeWord = (word: string, start: number): void => {
    if (measure(word) <= width) {
      line = word;
      lineStart = start;
      return;
    }
    let chunk = "";
    let chunkStart = start;
    let offset = 0;
    for (const character of word) {
      if (chunk !== "" && measure(chunk + character) > width) {
        broken.push(emit(chunk, chunkStart));
        chunk = character;
        chunkStart = start + offset;
      } else {
        chunk += character;
      }
      offset += character.length;
    }
    line = chunk;
    lineStart = chunkStart;
  };
  const tokens = [...paragraph.matchAll(/ *[^ ]+/g)];
  if (tokens.length === 0) return [emit("", origin)];
  for (const [index, match] of tokens.entries()) {
    const token = match[0]!;
    const tokenStart = origin + (match.index ?? 0);
    if (index === 0) {
      placeWord(token, tokenStart);
      continue;
    }
    if (measure(line + token) <= width) {
      line += token;
      continue;
    }
    broken.push(emit(line, lineStart));
    const trimmed = token.trimStart();
    placeWord(trimmed, tokenStart + (token.length - trimmed.length));
  }
  broken.push(emit(line, lineStart));
  return broken;
}

function boundaryXs(font: Font, text: string, element: TextElement): number[] {
  const xs = [0];
  let prefix = "";
  for (const character of text) {
    prefix += character;
    xs.push(layoutLine(font, prefix, element).width);
  }
  return xs;
}

export function layoutText(element: TextElement, font: Font): TextLayout {
  const scale = element.fontSize / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = -font.descender * scale;
  const box = element.fontSize * element.lineHeight;
  const content = normalize(element.content);
  const measure = (text: string): number => layoutLine(font, text, element).width;
  const broken =
    content === ""
      ? []
      : content.split("\n").flatMap((paragraph, index, paragraphs) => {
          const origin =
            paragraphs.slice(0, index).reduce((sum, part) => sum + part.length, 0) + index;
          return wrapParagraph(paragraph, origin, measure, element.width);
        });
  const height = broken.length * box;
  const top =
    element.anchor === "top"
      ? element.y
      : element.anchor === "middle"
        ? element.y - height / 2
        : element.y - height;
  const lines = broken.map((brokenLine, index) => {
    const line = layoutLine(font, brokenLine.text, element);
    const x =
      element.align === "left"
        ? element.x
        : element.align === "center"
          ? element.x + (element.width - line.width) / 2
          : element.x + element.width - line.width;
    return {
      baseline: top + index * box + (box - element.fontSize) / 2 + ascent,
      x,
      width: line.width,
      pieces: line.pieces.map((piece) => ({ ...piece, x: x + piece.x })),
      start: brokenLine.start,
      end: brokenLine.end,
      positions: boundaryXs(font, brokenLine.text, element).map((offset) => x + offset),
    };
  });
  return { lines, top, height, ascent, descent };
}

const parsedFonts = new WeakMap<ArrayBuffer, Font>();

function fontFrom(bytes: ArrayBuffer): Font {
  const cached = parsedFonts.get(bytes);
  if (cached) return cached;
  const font = parseFont(bytes);
  parsedFonts.set(bytes, font);
  return font;
}

export function layoutTextFromBytes(element: TextElement, fontBytes: ArrayBuffer): TextCaretLayout {
  const layout = layoutText(element, fontFrom(fontBytes));
  const lineBoxHeight = element.fontSize * element.lineHeight;
  if (layout.lines.length === 0) {
    const x =
      element.align === "left"
        ? element.x
        : element.align === "center"
          ? element.x + element.width / 2
          : element.x + element.width;
    return {
      lines: [
        {
          start: 0,
          end: 0,
          baselineY: layout.top + (lineBoxHeight - element.fontSize) / 2 + layout.ascent,
        },
      ],
      positions: [x],
      top: layout.top,
      ascent: layout.ascent,
      lineBoxHeight,
    };
  }
  return {
    lines: layout.lines.map((line) => ({
      start: line.start,
      end: line.end,
      baselineY: line.baseline,
    })),
    positions: layout.lines.flatMap((line) => line.positions),
    top: layout.top,
    ascent: layout.ascent,
    lineBoxHeight,
  };
}

function lineOffset(layout: TextCaretLayout, lineIndex: number): number {
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    const line = layout.lines[index]!;
    offset += line.end - line.start + 1;
  }
  return offset;
}

function lineIndexAt(layout: TextCaretLayout, index: number): number {
  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
    const next = layout.lines[lineIndex + 1];
    if (next === undefined || index < next.start) return lineIndex;
  }
  return Math.max(0, layout.lines.length - 1);
}

export function caretRect(
  layout: TextCaretLayout,
  index: number,
): { x: number; y: number; width: number; height: number } {
  const lineIndex = lineIndexAt(layout, index);
  const line = layout.lines[lineIndex];
  if (line === undefined) return { x: 0, y: 0, width: 1, height: layout.lineBoxHeight };
  const visual = Math.max(0, Math.min(index, line.end) - line.start);
  return {
    x: layout.positions[lineOffset(layout, lineIndex) + visual]!,
    y: layout.top + lineIndex * layout.lineBoxHeight,
    width: 1,
    height: layout.lineBoxHeight,
  };
}

export function hitIndex(layout: TextCaretLayout, point: { x: number; y: number }): number {
  if (layout.lines.length === 0) return 0;
  let lineIndex = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const [index, line] of layout.lines.entries()) {
    const gap = Math.abs(line.baselineY - point.y);
    if (gap < nearest) {
      nearest = gap;
      lineIndex = index;
    }
  }
  const line = layout.lines[lineIndex]!;
  const offset = lineOffset(layout, lineIndex);
  const count = line.end - line.start + 1;
  let visualIndex = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let visual = 0; visual < count; visual += 1) {
    const gap = Math.abs(layout.positions[offset + visual]! - point.x);
    if (gap < distance) {
      distance = gap;
      visualIndex = visual;
    }
  }
  return line.start + visualIndex;
}
