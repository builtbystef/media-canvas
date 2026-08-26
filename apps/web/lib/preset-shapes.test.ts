import type { DesignDocument } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import {
  PRESET_SHAPE_DRAG_TYPE,
  PRESET_SHAPES,
  presetShapeElement,
  serializePresetShapeDrag,
} from "./preset-shapes";

describe("preset shapes", () => {
  it("lists star, arrow, triangle, and line as ordinary vector artwork", () => {
    expect(PRESET_SHAPES.map((shape) => shape.name)).toEqual(["star", "arrow", "triangle", "line"]);
    for (const shape of PRESET_SHAPES) {
      expect(shape.path.length).toBeGreaterThan(0);
      expect(shape.viewBox).toEqual({ width: 100, height: shape.name === "line" ? 1 : 100 });
    }
  });

  it("places a preset at its natural size, scaled down to fit a smaller canvas", () => {
    const natural = presetShapeElement(
      "star-1",
      "star",
      { x: 10, y: 20 },
      { width: 2000, height: 2000 },
    );
    expect(natural).toMatchObject({
      id: "star-1",
      type: "vector",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      viewBox: { width: 100, height: 100 },
      fill: "#D9D9D9",
    });
    expect(natural.path).toBe(PRESET_SHAPES[0]?.path);
    expect("preset" in natural).toBe(false);

    const fitted = presetShapeElement("star-2", "star", { x: 0, y: 0 }, { width: 50, height: 80 });
    expect(fitted).toMatchObject({ width: 50, height: 50, viewBox: { width: 100, height: 100 } });
    expect(fitted.path).toBe(natural.path);
  });

  it("commits a placed preset as one store transition and selects it", () => {
    const document: DesignDocument = {
      schemaVersion: 1,
      canvas: { width: 400, height: 400, background: "#FFFFFF" },
      elements: [],
    };
    const store = createEditorStore(document);
    let transitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) transitions += 1;
    });
    const element = presetShapeElement("arrow-1", "arrow", { x: 8, y: 12 }, document.canvas);
    store.getState().createElement(element);

    expect(store.getState().document?.elements).toEqual([element]);
    expect(store.getState().selected).toEqual(["arrow-1"]);
    expect(transitions).toBe(1);
    store.getState().undo();
    expect(store.getState().document).toBe(document);
  });

  it("writes a panel drag payload the canvas can read back", () => {
    expect(serializePresetShapeDrag("triangle")).toBe("triangle");
    expect(PRESET_SHAPE_DRAG_TYPE).toBe("application/x-media-canvas-preset-shape");
  });
});
