import type { DesignDocument } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_ASSET_ID,
  createDrawnElement,
  drawingBounds,
  toolForKey,
} from "./drawing-tools";
import { addElement } from "./document-operations";
import { createEditorStore } from "./editor-store";

const document: DesignDocument = {
  schemaVersion: 1,
  canvas: { width: 500, height: 500, background: "#FFFFFF" },
  elements: [],
};

describe("drawing tools", () => {
  it("maps the five settled single-key shortcuts", () => {
    expect(["V", "t", "r", "O", "h"].map(toolForKey)).toEqual([
      "select",
      "text",
      "rect",
      "ellipse",
      "hand",
    ]);
    expect(toolForKey("i")).toBeNull();
  });

  it("creates the settled plain-click rectangle defaults at the click point", () => {
    expect(createDrawnElement("rect", "rect-1", { x: 20, y: 30 }, { x: 20, y: 30 })).toEqual({
      id: "rect-1",
      type: "rect",
      x: 20,
      y: 30,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      fill: "#D9D9D9",
    });
  });

  it("constrains shape drawing and draws from its centre", () => {
    expect(drawingBounds({ x: 50, y: 50 }, { x: 70, y: 60 }, true, true)).toEqual({
      left: 30,
      top: 30,
      right: 70,
      bottom: 70,
    });
  });

  it("creates text with the settled font and typography defaults", () => {
    expect(createDrawnElement("text", "text-1", { x: 10, y: 12 }, { x: 10, y: 12 })).toEqual({
      id: "text-1",
      type: "text",
      x: 10,
      y: 12,
      width: 300,
      content: "",
      fontAssetId: DEFAULT_FONT_ASSET_ID,
      fontSize: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: "left",
      anchor: "top",
      color: "#000000",
      rotation: 0,
      opacity: 1,
      visible: true,
    });

    expect(createDrawnElement("text", "text-2", { x: 80, y: 40 }, { x: 20, y: 140 })).toMatchObject(
      {
        x: 20,
        y: 40,
        width: 60,
      },
    );
  });

  it("commits one creation transition, selects it, and returns to Select", () => {
    const store = createEditorStore(document);
    const element = createDrawnElement("ellipse", "ellipse-1", { x: 5, y: 6 }, { x: 25, y: 36 });
    let documentTransitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) documentTransitions += 1;
    });

    store.getState().armTool("ellipse");
    store.getState().createElement(element);

    expect(store.getState()).toMatchObject({
      activeTool: "select",
      selected: ["ellipse-1"],
      editingTextId: null,
    });
    expect(store.getState().document).toEqual(addElement(document, element));
    expect(documentTransitions).toBe(1);
  });

  it("opens a newly created text Element for editing", () => {
    const store = createEditorStore(document);
    const element = createDrawnElement("text", "text-1", { x: 5, y: 6 }, { x: 5, y: 6 });

    store.getState().createElement(element);

    expect(store.getState()).toMatchObject({
      activeTool: "select",
      selected: ["text-1"],
      editingTextId: "text-1",
    });
  });
});
