import type {
  DesignDocument,
  Element,
  GradientStop,
  GroupElement,
  LinearGradient,
  RectElement,
  TextElement,
} from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import {
  addGradientStop,
  commonValue,
  removeGradientStop,
  selectedElements,
  updateCanvas,
  updateGradientStop,
  updateSelectedElements,
} from "./inspector-operations";

const base = { rotation: 0, opacity: 1, visible: true as const };

function rect(id: string, x: number, fill = "#000000"): RectElement {
  return {
    ...base,
    id,
    type: "rect",
    x,
    y: 0,
    width: 10,
    height: 10,
    fill,
  };
}

function documentWith(elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements,
  };
}

describe("inspector operations", () => {
  it("reports a mixed value instead of choosing one selected Element's value", () => {
    const document = documentWith([rect("one", 10), rect("two", 20)]);
    const selection = selectedElements(document, ["one", "two"]);

    expect(commonValue(selection, (element) => element.x)).toEqual({ kind: "mixed" });
    expect(commonValue(selection, (element) => element.opacity)).toEqual({
      kind: "same",
      value: 1,
    });
  });

  it("applies one property edit to every selected Element and preserves other identities", () => {
    const one = rect("one", 10);
    const two = rect("two", 20);
    const untouched = rect("untouched", 30);
    const original = documentWith([one, two, untouched]);

    const changed = updateSelectedElements(original, ["one", "two"], (element) => ({
      ...element,
      opacity: 0.4,
    }));

    expect(changed.elements.slice(0, 2)).toMatchObject([{ opacity: 0.4 }, { opacity: 0.4 }]);
    expect(changed.elements[2]).toBe(untouched);
  });

  it("changes a nested selection while replacing only its ancestors", () => {
    const child = rect("child", 2);
    const sibling = rect("sibling", 3);
    const group: GroupElement = {
      ...base,
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      children: [child, sibling],
    };
    const outside = rect("outside", 4);

    const changed = updateSelectedElements(
      documentWith([group, outside]),
      ["child"],
      (element) => ({
        ...element,
        x: 8,
      }),
    );
    const changedGroup = changed.elements[0] as GroupElement;

    expect(changedGroup).not.toBe(group);
    expect(changedGroup.children[0]).toMatchObject({ x: 8 });
    expect(changedGroup.children[1]).toBe(sibling);
    expect(changed.elements[1]).toBe(outside);
  });

  it("edits the whole text Element's typography", () => {
    const text: TextElement = {
      ...base,
      id: "text",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      content: "whole Element",
      fontAssetId: "font",
      fontSize: 16,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: "left",
      anchor: "top",
      color: "#000000",
    };

    const changed = updateSelectedElements(documentWith([text]), ["text"], (element) =>
      element.type === "text" ? { ...element, fontSize: 24, align: "center" } : element,
    );

    expect(changed.elements[0]).toMatchObject({
      content: "whole Element",
      fontSize: 24,
      align: "center",
    });
  });

  it("commits a scrub once from its gesture start and selects every touched Element", () => {
    const original = documentWith([rect("one", 10), rect("two", 20)]);
    const store = createEditorStore(original);
    let transitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) transitions += 1;
    });

    store.getState().commitInspectorEdit(
      (document) =>
        updateSelectedElements(document, ["one", "two"], (element) => ({
          ...element,
          opacity: 0.5,
        })),
      ["one", "two"],
      original,
    );

    expect(store.getState().document?.elements).toMatchObject([{ opacity: 0.5 }, { opacity: 0.5 }]);
    expect(store.getState().selected).toEqual(["one", "two"]);
    expect(transitions).toBe(1);
  });

  it("resizes the canvas without moving or scaling Elements", () => {
    const element = rect("one", 10);
    const original = documentWith([element]);

    const changed = updateCanvas(original, { width: 1920, height: 1080 });

    expect(changed.canvas).toEqual({ width: 1920, height: 1080, background: "#FFFFFF" });
    expect(changed.elements).toBe(original.elements);
    expect(changed.elements[0]).toBe(element);
  });

  it("adds, moves, recolors, and removes gradient stops while retaining two endpoints", () => {
    const gradient: LinearGradient = {
      type: "linear",
      angle: 90,
      stops: [
        { offset: 0, color: "#FF0000" },
        { offset: 1, color: "#0000FF" },
      ],
    };

    const added = addGradientStop(gradient, { offset: 0.5, color: "#00FF00" });
    const moved = updateGradientStop(added, 1, { offset: 0.75, color: "#00FFFF" });
    const removed = removeGradientStop(moved, 1);

    expect(added.stops.map((stop: GradientStop) => stop.offset)).toEqual([0, 0.5, 1]);
    expect(moved.stops[1]).toEqual({ offset: 0.75, color: "#00FFFF" });
    expect(removed.stops).toEqual(gradient.stops);
    expect(removeGradientStop(gradient, 0)).toBe(gradient);
  });
});
