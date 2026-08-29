import { describe, expect, it } from "vitest";
import {
  DUPLICATE_OFFSET,
  NUDGE_DISTANCE,
  NUDGE_DISTANCE_SHIFTED,
  commandFromKey,
  unwindEscape,
} from "./keyboard-map";

describe("keyboard map", () => {
  it("nudges one unit, or ten with Shift, matching the settled offsets", () => {
    expect(NUDGE_DISTANCE).toBe(1);
    expect(NUDGE_DISTANCE_SHIFTED).toBe(10);
    expect(DUPLICATE_OFFSET).toEqual({ x: 10, y: 10 });

    expect(commandFromKey({ key: "ArrowLeft" })).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(commandFromKey({ key: "ArrowRight" })).toEqual({ type: "nudge", dx: 1, dy: 0 });
    expect(commandFromKey({ key: "ArrowUp" })).toEqual({ type: "nudge", dx: 0, dy: -1 });
    expect(commandFromKey({ key: "ArrowDown" })).toEqual({ type: "nudge", dx: 0, dy: 1 });
    expect(commandFromKey({ key: "ArrowLeft", shiftKey: true })).toEqual({
      type: "nudge",
      dx: -10,
      dy: 0,
    });
    expect(commandFromKey({ key: "ArrowDown", shiftKey: true })).toEqual({
      type: "nudge",
      dx: 0,
      dy: 10,
    });
  });

  it("maps the settled shortcuts for duplicate, clipboard, grouping, z-order, and select-all", () => {
    expect(commandFromKey({ key: "d", metaKey: true })).toEqual({ type: "duplicate" });
    expect(commandFromKey({ key: "c", ctrlKey: true })).toEqual({ type: "copy" });
    expect(commandFromKey({ key: "x", metaKey: true })).toEqual({ type: "cut" });
    expect(commandFromKey({ key: "v", metaKey: true })).toEqual({ type: "paste" });
    expect(commandFromKey({ key: "Delete" })).toEqual({ type: "delete" });
    expect(commandFromKey({ key: "Backspace" })).toEqual({ type: "delete" });
    expect(commandFromKey({ key: "g", metaKey: true })).toEqual({ type: "group" });
    expect(commandFromKey({ key: "g", metaKey: true, shiftKey: true })).toEqual({
      type: "ungroup",
    });
    expect(commandFromKey({ key: "]", metaKey: true })).toEqual({ type: "bring-forward" });
    expect(commandFromKey({ key: "[", metaKey: true })).toEqual({ type: "send-backward" });
    expect(commandFromKey({ key: "]", metaKey: true, altKey: true })).toEqual({
      type: "bring-to-front",
    });
    expect(commandFromKey({ key: "[", ctrlKey: true, altKey: true })).toEqual({
      type: "send-to-back",
    });
    expect(commandFromKey({ key: "a", metaKey: true })).toEqual({ type: "select-all" });
    expect(commandFromKey({ key: "Escape" })).toEqual({ type: "escape" });
  });

  it("unwinds Escape one step at a time rather than jumping to a clean slate", () => {
    const drawing = unwindEscape({
      activeTool: "rect",
      editingTextId: null,
      enteredPath: ["group"],
      selected: ["child"],
    });
    expect(drawing).toEqual({
      activeTool: "select",
      editingTextId: null,
      enteredPath: ["group"],
      selected: ["child"],
    });

    const editing = unwindEscape({
      activeTool: "select",
      editingTextId: "headline",
      enteredPath: ["group"],
      selected: ["headline"],
    });
    expect(editing).toMatchObject({
      activeTool: "select",
      editingTextId: null,
      enteredPath: ["group"],
    });

    const inside = unwindEscape({
      activeTool: "select",
      editingTextId: null,
      enteredPath: ["outer", "inner"],
      selected: ["leaf"],
    });
    expect(inside).toEqual({
      activeTool: "select",
      editingTextId: null,
      enteredPath: ["outer"],
      selected: ["inner"],
    });

    const top = unwindEscape({
      activeTool: "select",
      editingTextId: null,
      enteredPath: [],
      selected: ["one", "two"],
    });
    expect(top).toEqual({
      activeTool: "select",
      editingTextId: null,
      enteredPath: [],
      selected: [],
    });
  });
});
