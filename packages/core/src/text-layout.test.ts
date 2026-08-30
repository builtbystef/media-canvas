import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import { expect, test } from "vitest";

import type { TextElement } from "./index.ts";
import { caretRect, hitIndex, layoutText } from "./index.ts";

const oswaldBold = bundledFonts.find(
  (font) => font.family === "Oswald" && font.weight === 700 && font.style === "normal",
)!;

const fontBytes = bundledFontBytes(oswaldBold);

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "t",
    type: "text",
    x: 0,
    y: 0,
    width: 290,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "LIMITED OFFER",
    fontAssetId: oswaldBold.id,
    fontSize: 30,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
    ...overrides,
  };
}

test("the wrap width alone decides the content ranges of each line", () => {
  const wide = layoutText(text({ width: 290 }), fontBytes);
  const narrow = layoutText(text({ width: 120 }), fontBytes);

  expect(wide.lines.map((line) => ({ start: line.start, end: line.end }))).toEqual([
    { start: 0, end: 13 },
  ]);
  expect(narrow.lines.map((line) => ({ start: line.start, end: line.end }))).toEqual([
    { start: 0, end: 7 },
    { start: 8, end: 13 },
  ]);
  expect(narrow.positions).toHaveLength(14);
  expect(wide.positions).toHaveLength(14);
});

test("clicking just past the last character of a wrapped first line stays on that line", () => {
  const layout = layoutText(text({ width: 120 }), fontBytes);
  const first = layout.lines[0]!;
  const lastOnLine = layout.positions[first.end - first.start]!;

  expect(hitIndex(layout, { x: lastOnLine + 1, y: first.baselineY })).toBe(7);
  expect(hitIndex(layout, { x: lastOnLine + 1, y: first.baselineY })).not.toBe(8);

  const caret = caretRect(layout, 7);
  expect(caret.x).toBe(lastOnLine);
  expect(caret.y).toBeLessThan(layout.lines[1]!.baselineY);
});
