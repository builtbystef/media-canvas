import type { DesignDocument, Element, GroupElement, RectElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  moveElements,
  renameElement,
  reorderElement,
  setElementVisibility,
} from "./document-operations";

function rect(id: string, x = 0): RectElement {
  return {
    id,
    type: "rect",
    x,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#000000",
  };
}

function documentWith(elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements,
  };
}

describe("document operations", () => {
  it("moves selected elements while preserving every untouched identity", () => {
    const elements = Array.from({ length: 10 }, (_, index) => rect(String(index), index * 10));
    const original = documentWith(elements);

    const moved = moveElements(original, ["4"], 5, 7);

    expect(moved).not.toBe(original);
    expect(moved.elements[4]).toMatchObject({ x: 45, y: 7, rotation: 0 });
    for (const [index, element] of moved.elements.entries()) {
      if (index !== 4) expect(element).toBe(elements[index]);
    }
  });

  it("replaces only a changed child and its ancestor group", () => {
    const first = rect("first");
    const second = rect("second");
    const group: GroupElement = {
      id: "group",
      type: "group",
      name: "Group",
      x: 3,
      y: 4,
      rotation: 12,
      opacity: 1,
      visible: true,
      children: [first, second],
    };
    const outside = rect("outside");
    const original = documentWith([group, outside]);

    const moved = moveElements(original, ["second"], 2, 3);

    expect(moved.elements[0]).not.toBe(group);
    expect((moved.elements[0] as GroupElement).children[0]).toBe(first);
    expect((moved.elements[0] as GroupElement).children[1]).toMatchObject({ x: 2, y: 3 });
    expect(moved.elements[1]).toBe(outside);
    expect(moved.elements[0]?.rotation).toBe(12);
  });

  it("renames and toggles visibility through the document field", () => {
    const originalElement = rect("one");
    const original = documentWith([originalElement]);

    const renamed = renameElement(original, "one", "Hero");
    const hidden = setElementVisibility(renamed, "one", false);

    expect(renamed.elements[0]).toMatchObject({ name: "Hero", visible: true });
    expect(hidden.elements[0]).toMatchObject({ name: "Hero", visible: false });
  });

  it("reorders only siblings in the named group", () => {
    const a = rect("a");
    const b = rect("b");
    const group: GroupElement = {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [a, b],
    };
    const outside = rect("outside");
    const original = documentWith([group, outside]);

    const reordered = reorderElement(original, ["group"], "a", 1);

    expect((reordered.elements[0] as GroupElement).children).toEqual([b, a]);
    expect(reordered.elements[1]).toBe(outside);
  });
});
