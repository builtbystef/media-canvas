import type { TextLayout } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  insertText,
  interpretTextPointerDown,
  successiveClickCount,
  moveByCharacter,
  moveByLine,
  moveByWord,
  moveToLineBoundary,
  selectWord,
} from "./text-editing";

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

  it("replaces the selection, as paste and cut do", () => {
    expect(insertText("Hello World", { anchor: 6, focus: 11 }, "there")).toEqual({
      content: "Hello there",
      selection: { anchor: 11, focus: 11 },
    });
    expect(insertText("Hello World", { anchor: 6, focus: 11 }, "")).toEqual({
      content: "Hello ",
      selection: { anchor: 6, focus: 6 },
    });
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

  it("a second click on text begins editing and does not collapse a word selection", () => {
    expect(
      interpretTextPointerDown({
        editingId: null,
        targetId: "headline",
        isText: true,
        detail: 2,
        shiftKey: false,
        index: 4,
      }),
    ).toEqual({ action: "begin" });
    expect(
      interpretTextPointerDown({
        editingId: "headline",
        targetId: "headline",
        isText: true,
        detail: 2,
        shiftKey: false,
        index: 4,
      }),
    ).toEqual({ action: "begin" });
    expect(
      interpretTextPointerDown({
        editingId: "headline",
        targetId: "headline",
        isText: true,
        detail: 1,
        shiftKey: false,
        index: 4,
      }),
    ).toEqual({ action: "drag-select", index: 4, extend: false });
    expect(
      interpretTextPointerDown({
        editingId: "headline",
        targetId: "other",
        isText: false,
        detail: 1,
        shiftKey: false,
        index: 0,
      }),
    ).toEqual({ action: "end" });
    expect(
      interpretTextPointerDown({
        editingId: null,
        targetId: "headline",
        isText: true,
        detail: 1,
        shiftKey: false,
        index: 4,
      }),
    ).toEqual({ action: "none" });
    const first = successiveClickCount(null, "headline", 0);
    const second = successiveClickCount(first, "headline", 200);
    const late = successiveClickCount(second, "headline", 800);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(late.count).toBe(1);
  });
});
