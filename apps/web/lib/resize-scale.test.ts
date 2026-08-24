import type {
  DesignDocument,
  GroupElement,
  ImageElement,
  RectElement,
  TextElement,
  VectorElement,
} from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import { applyHandleDrag, handlesForSelection } from "./resize-scale";

const base = {
  rotation: 0,
  opacity: 1,
  visible: true as const,
};

function documentWith(...elements: DesignDocument["elements"]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 1000, height: 1000, background: "#FFFFFF" },
    elements,
  };
}

describe("Resize and Scale handles", () => {
  it("resizes in a rotated Element's local frame and leaves its opposite edge pinned", () => {
    const element: RectElement = {
      ...base,
      id: "rect",
      type: "rect",
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      rotation: 90,
      fill: "#000000",
    };

    const changed = applyHandleDrag(documentWith(element), ["rect"], "right", { x: 0, y: 40 });

    expect(changed.elements[0]).toMatchObject({ x: 80, y: 120, width: 140, height: 50 });
    // The local left-edge midpoint remains at the same screen coordinate.
    expect(changed.elements[0]).toMatchObject({ rotation: 90 });
  });

  it("supports aspect and centre modifiers without scaling Resize-owned decoration", () => {
    const element: RectElement = {
      ...base,
      id: "rect",
      type: "rect",
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      fill: "#000000",
      border: { color: "#FFFFFF", width: 2 },
      cornerRadius: 8,
      shadow: { dx: 3, dy: 4, blur: 5, color: "#000000", opacity: 0.5 },
    };

    const changed = applyHandleDrag(
      documentWith(element),
      ["rect"],
      "bottom-right",
      { x: 100, y: 10 },
      { keepAspect: true, fromCenter: true },
    );

    expect(changed.elements[0]).toMatchObject({
      x: 0,
      y: 50,
      width: 300,
      height: 150,
      border: { width: 2 },
      cornerRadius: 8,
      shadow: { dx: 3, dy: 4, blur: 5 },
    });
  });

  it("resizes a vector without changing its path or viewBox", () => {
    const element: VectorElement = {
      ...base,
      id: "vector",
      type: "vector",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      path: "M0 0L20 10",
      viewBox: { width: 20, height: 10 },
      fill: "#000000",
    };

    const changed = applyHandleDrag(documentWith(element), ["vector"], "bottom-right", {
      x: 20,
      y: 30,
    });

    expect(changed.elements[0]).toMatchObject({
      width: 40,
      height: 40,
      path: "M0 0L20 10",
      viewBox: { width: 20, height: 10 },
    });
  });

  it("gives text only wrap-width sides and uniform Scale corners", () => {
    const element: TextElement = {
      ...base,
      id: "text",
      type: "text",
      x: 10,
      y: 30,
      width: 100,
      content: "Some text",
      fontAssetId: "font",
      fontSize: 20,
      lineHeight: 1.2,
      letterSpacing: 2,
      align: "left",
      anchor: "middle",
      color: "#000000",
      shadow: { dx: 2, dy: 3, blur: 4, color: "#000000", opacity: 1 },
    };

    expect(handlesForSelection([element])).toEqual([
      "top-left",
      "top-right",
      "right",
      "bottom-right",
      "bottom-left",
      "left",
    ]);
    const reflowed = applyHandleDrag(documentWith(element), ["text"], "right", { x: 50, y: 0 });
    expect(reflowed.elements[0]).toMatchObject({ width: 150, y: 30, fontSize: 20 });

    const scaled = applyHandleDrag(
      documentWith(element),
      ["text"],
      "bottom-right",
      { x: 100, y: 60 },
      { bounds: { left: 10, top: 10, right: 110, bottom: 70 } },
    );
    expect(scaled.elements[0]).toMatchObject({
      width: 200,
      fontSize: 40,
      letterSpacing: 4,
      shadow: { dx: 4, dy: 6, blur: 8 },
    });
  });

  it("scales an image frame and its authored content in step", () => {
    const element: ImageElement = {
      ...base,
      id: "image",
      type: "image",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      src: "asset",
      naturalWidth: 200,
      naturalHeight: 100,
      content: { offsetX: -10, offsetY: -5, scale: 0.75 },
      fitMode: "cover",
      clip: "none",
    };

    const changed = applyHandleDrag(documentWith(element), ["image"], "bottom-right", {
      x: 100,
      y: 50,
    });

    expect(changed.elements[0]).toMatchObject({
      width: 200,
      height: 100,
      content: { offsetX: -20, offsetY: -10, scale: 1.5 },
    });
  });

  it("scales groups uniformly and recursively, including every owned length", () => {
    const nestedText: TextElement = {
      ...base,
      id: "text",
      type: "text",
      x: 5,
      y: 10,
      width: 80,
      content: "Nested",
      fontAssetId: "font",
      fontSize: 12,
      lineHeight: 1.2,
      letterSpacing: 1,
      align: "left",
      anchor: "top",
      color: "#000000",
      shadow: { dx: 2, dy: 3, blur: 4, color: "#000000", opacity: 1 },
    };
    const nestedRect: RectElement = {
      ...base,
      id: "nested-rect",
      type: "rect",
      x: 10,
      y: 20,
      width: 20,
      height: 30,
      fill: "#000000",
      border: { color: "#FFFFFF", width: 2 },
      cornerRadius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
    };
    const inner: GroupElement = {
      ...base,
      id: "inner",
      type: "group",
      x: 10,
      y: 15,
      children: [nestedText, nestedRect],
    };
    const group: GroupElement = {
      ...base,
      id: "group",
      type: "group",
      x: 100,
      y: 100,
      children: [inner],
    };

    const changed = applyHandleDrag(
      documentWith(group),
      ["group"],
      "bottom-right",
      { x: 100, y: 100 },
      { bounds: { left: 100, top: 100, right: 200, bottom: 200 } },
    );
    const changedGroup = changed.elements[0] as GroupElement;
    const changedInner = changedGroup.children[0] as GroupElement;
    expect(changedInner).toMatchObject({ x: 20, y: 30 });
    expect(changedInner.children[0]).toMatchObject({
      x: 10,
      y: 20,
      width: 160,
      fontSize: 24,
      letterSpacing: 2,
      shadow: { dx: 4, dy: 6, blur: 8 },
    });
    expect(changedInner.children[1]).toMatchObject({
      x: 20,
      y: 40,
      width: 40,
      height: 60,
      border: { width: 4 },
      cornerRadius: { topLeft: 2, topRight: 4, bottomRight: 6, bottomLeft: 8 },
    });
  });

  it("offers only uniform corners for groups and multiple selections, committed once", () => {
    const one: RectElement = {
      ...base,
      id: "one",
      type: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: "#000000",
    };
    const two = { ...one, id: "two", x: 20 };
    const group: GroupElement = { ...base, id: "group", type: "group", x: 0, y: 0, children: [] };

    expect(handlesForSelection([group])).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ]);
    expect(handlesForSelection([one, two])).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ]);

    const store = createEditorStore(documentWith(one, two));
    let documentTransitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) documentTransitions += 1;
    });

    store
      .getState()
      .commitHandleDrag(
        ["one", "two"],
        "bottom-right",
        { x: 30, y: 10 },
        { bounds: { left: 0, top: 0, right: 30, bottom: 10 } },
      );

    expect(store.getState().document?.elements).toMatchObject([
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 40, y: 0, width: 20, height: 20 },
    ]);
    expect(store.getState().selected).toEqual(["one", "two"]);
    expect(documentTransitions).toBe(1);
  });
});
