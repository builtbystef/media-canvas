// The compiler's own text layout. The line breaks a text element renders with
// are computed here, from the Font Asset's own advance widths, and written into
// the markup as fixed positions — so the browser that draws the compiled SVG is
// never free to rewrap a line and make the editor and the export disagree.

import type { Font, RenderOptions } from "opentype.js";
import { parse as parseFont } from "opentype.js";

import type { TextElement } from "./document.ts";

/** A run of characters on one line that share a fate: either the Font Asset
 *  draws them, or it has no glyph for them and draws its own `.notdef`. A
 *  missing character is always a piece of its own. */
export type TextPiece = {
  /** Canvas x of the piece's own left edge. */
  x: number;
  width: number;
  text: string;
  missing: boolean;
};

export type TextLine = {
  /** Canvas y of the line's baseline. */
  baseline: number;
  /** Canvas x the line starts at, after `align` has placed it. */
  x: number;
  width: number;
  pieces: TextPiece[];
  /** Content index of the first character drawn on this line. */
  start: number;
  /** Content index past the last character drawn on this line. */
  end: number;
  /** Canvas x of each character boundary on this line (`end - start + 1`). */
  positions: number[];
};

/** The layout the editor draws a caret from: the compiler's own line breaks,
 *  as ranges over the content and the x of every character boundary. */
export type TextCaretLayout = {
  lines: Array<{ start: number; end: number; baselineY: number }>;
  /** x of each character boundary, per line concatenated. */
  positions: number[];
  /** Top of the first line box, after `anchor` has placed the block. */
  top: number;
  ascent: number;
  lineBoxHeight: number;
};

export type TextLayout = {
  lines: TextLine[];
  /** The top of the block of line boxes, after `anchor` has placed it. */
  top: number;
  /** `lines.length` line boxes, each `fontSize × lineHeight` tall. */
  height: number;
  /** The font's own ascent and descent, scaled to `fontSize`. */
  ascent: number;
  descent: number;
};

/** The content as the layout reads it. A newline is a break the author wrote,
 *  so `\r\n` becomes one break rather than two; a tab becomes the space that
 *  SVG's own whitespace handling would turn it into anyway, which keeps a font
 *  with no tab glyph from being measured drawing `.notdef` where the browser
 *  draws a space. What is left of the whitespace — the plain space — is the
 *  only place a line may break. */
function normalize(content: string): string {
  return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\t", " ");
}

/** opentype's `letterSpacing` is a multiple of the font size and lands after
 *  every glyph, the last one included; the document's is px and lands in the
 *  gaps between glyphs, so the trailing one comes back off the measurement. */
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

/** The advance of the font's own `.notdef`, which every character the font has
 *  no glyph for is drawn with. */
function notdefWidth(font: Font, fontSize: number): number {
  return ((font.glyphs.get(0).advanceWidth ?? 0) / font.unitsPerEm) * fontSize;
}

/** A line split where the font's coverage changes. A character the font has no
 *  glyph for is a run of its own, because the compiler draws each of those as
 *  the font's `.notdef` outline rather than leaving it to the browser, which
 *  would answer a missing glyph with some other face entirely. */
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

/** One line's pieces, laid out from x 0, with one letter-spacing gap between
 *  each pair — the same gap the glyphs inside a piece already carry, so that a
 *  line measures the same however the font's coverage splits it. */
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

/** Greedy line breaking: each word joins the line while the line still fits the
 *  wrap width, and a word that cannot fit a line of its own is broken between
 *  characters. Whitespace travels with the word that follows it, so the spaces
 *  a break consumes leave with it and the ones inside a line stay. */
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
    // The paragraph's own first token keeps the indentation it was written
    // with; a token that starts a wrapped line drops the spaces it broke at.
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

/** Canvas x of every character boundary in `text`, from an origin of 0. */
function boundaryXs(font: Font, text: string, element: TextElement): number[] {
  const xs = [0];
  let prefix = "";
  for (const character of text) {
    prefix += character;
    xs.push(layoutLine(font, prefix, element).width);
  }
  return xs;
}

/**
 * Lay a text element out: where each line breaks, where it starts, and where
 * its baseline sits. The vertical convention is CSS-like half-leading — a line
 * box is `fontSize × lineHeight` tall and the baseline sits `(box − fontSize)/2`
 * plus the font's own ascent below the box's top — and `anchor` moves the whole
 * block of line boxes, whose top is the element's y when the anchor is `top`.
 */
export function layoutText(element: TextElement, font: Font): TextLayout {
  const scale = element.fontSize / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = -font.descender * scale;
  const box = element.fontSize * element.lineHeight;
  const content = normalize(element.content);
  const measure = (text: string): number => layoutLine(font, text, element).width;
  // Empty content is a legal text value, and it collapses the box to no
  // content height at all rather than to one empty line.
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

/** The compiler's own line breaking, as ranges over the content and the x of
 *  every character boundary — the data the editor draws a caret from. */
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

/** The caret rectangle on the canvas for a position in the content. */
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

/** The content index a click on the canvas maps to. The line is chosen by y,
 *  then the nearest character boundary on that line by x — so a click past the
 *  last character of a wrapped line stays on that line. */
export function hitIndex(layout: TextCaretLayout, point: { x: number; y: number }): number {
  if (layout.lines.length === 0) return 0;
  // Glyphs can sit past their line box (Oswald's ascent does), so the line is
  // the one whose baseline is nearest the click, not the box the y falls in.
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
