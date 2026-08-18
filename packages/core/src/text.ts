// The compiler's own text layout. The line breaks a text element renders with
// are computed here, from the Font Asset's own advance widths, and written into
// the markup as fixed positions — so the browser that draws the compiled SVG is
// never free to rewrap a line and make the editor and the export disagree.

import type { Font, RenderOptions } from "opentype.js";

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

/** Greedy line breaking: each word joins the line while the line still fits the
 *  wrap width, and a word that cannot fit a line of its own is broken between
 *  characters. Whitespace travels with the word that follows it, so the spaces
 *  a break consumes leave with it and the ones inside a line stay. */
function wrapParagraph(
  paragraph: string,
  measure: (text: string) => number,
  width: number,
): string[] {
  const broken: string[] = [];
  let line = "";
  const placeWord = (word: string): void => {
    if (measure(word) <= width) {
      line = word;
      return;
    }
    let chunk = "";
    for (const character of word) {
      if (chunk !== "" && measure(chunk + character) > width) {
        broken.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    line = chunk;
  };
  const tokens = paragraph.match(/ *[^ ]+/g) ?? [];
  for (const [index, token] of tokens.entries()) {
    // The paragraph's own first token keeps the indentation it was written
    // with; a token that starts a wrapped line drops the spaces it broke at.
    if (index === 0) {
      placeWord(token);
      continue;
    }
    if (measure(line + token) <= width) {
      line += token;
      continue;
    }
    broken.push(line);
    placeWord(token.trimStart());
  }
  broken.push(line);
  return broken;
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
      : content
          .split("\n")
          .flatMap((paragraph) => wrapParagraph(paragraph, measure, element.width));
  const height = broken.length * box;
  const top =
    element.anchor === "top"
      ? element.y
      : element.anchor === "middle"
        ? element.y - height / 2
        : element.y - height;
  const lines = broken.map((text, index) => {
    const line = layoutLine(font, text, element);
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
    };
  });
  return { lines, top, height, ascent, descent };
}
