import type { TextLayout } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  insertText,
  moveByCharacter,
  moveByLine,
  moveByWord,
  moveToLineBoundary,
  selectWord,
} from "./text-editing";

/** Two wrapped lines of `LIMITED OFFER`, as `layoutText` reports them. */
const wrapped: TextLayout = {
  lines: [
    { start: 0, end: 7, baselineY: 10 },
    { start: 8, end: 13, baselineY: 46 },
  ],
  positions: [0, 10, 20, 30, 40, 50, 60, 70, 0, 12, 24, 36, 48, 60],
  top: 0,
  ascent: 8,
  lineBoxHeight: 36,
};

describe("text editing", () => {
  it("inserts a hard break at the caret and treats a token as ordinary characters", () => {
    const inserted = insertText("Price: {{old}}", { anchor: 7, focus: 7 }, "\n");

    expect(inserted.content).toBe("Price: \n{{old}}");
    expect(inserted.selection).toEqual({ anchor: 8, focus: 8 });
  });

  it("moves by character, word, and visual line", () => {
    expect(moveByCharacter("LIMITED OFFER", { anchor: 7, focus: 7 }, 1, false)).toEqual({
      anchor: 8,
      focus: 8,
    });
    expect(moveByWord("Price: {{old}}", { anchor: 0, focus: 0 }, 1, false)).toEqual({
      anchor: 5,
      focus: 5,
    });
    expect(moveByLine(wrapped, { anchor: 0, focus: 0 }, 1, false)).toEqual({
      anchor: 8,
      focus: 8,
    });
    expect(moveToLineBoundary(wrapped, { anchor: 3, focus: 3 }, "end", false)).toEqual({
      anchor: 7,
      focus: 7,
    });
    expect(selectWord("Price: {{old}}", 9)).toEqual({ anchor: 9, focus: 12 });
  });
});
