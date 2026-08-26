import type { DesignDocument, ImageElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import { applyCropPan, authoredImageContent, cropImageFrame } from "./image-crop";
import { applyHandleDrag, handlesForSelection } from "./resize-scale";

const base = {
  id: "image",
  type: "image" as const,
  rotation: 0,
  opacity: 1,
  visible: true as const,
  src: "asset",
  naturalWidth: 200,
  naturalHeight: 100,
  fitMode: "cover" as const,
  clip: "none" as const,
};

function photo(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base,
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    content: { offsetX: 0, offsetY: 0, scale: 1 },
    ...overrides,
  };
}

function documentWith(element: ImageElement): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 1000, height: 1000, background: "#FFFFFF" },
    elements: [element],
  };
}

describe("Crop Mode", () => {
  it("pulling the right edge inward narrows the frame and leaves the photo where it was", () => {
    const cropped = cropImageFrame(photo(), "right", { x: -50, y: 0 });

    expect(cropped).toMatchObject({
      x: 10,
      y: 20,
      width: 150,
      height: 100,
      content: { offsetX: 0, offsetY: 0, scale: 1 },
    });
  });

  it("pulling the left edge inward moves the frame and keeps the bitmap pinned", () => {
    const cropped = cropImageFrame(photo(), "left", { x: 50, y: 0 });

    expect(cropped).toMatchObject({
      x: 60,
      y: 20,
      width: 150,
      height: 100,
      content: { offsetX: -50, offsetY: 0, scale: 1 },
    });
  });

  it("dragging inside moves the bitmap under the frame", () => {
    const panned = applyCropPan(photo(), { x: 12, y: -8 });

    expect(panned).toMatchObject({
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      content: { offsetX: 12, offsetY: -8, scale: 1 },
    });
  });

  it("offers every frame handle in Crop Mode and only Scale corners outside it", () => {
    expect(handlesForSelection([photo()])).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ]);
    expect(handlesForSelection([photo()], true)).toEqual([
      "top-left",
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
    ]);
  });

  it("applies a crop-frame handle through applyHandleDrag without scaling the bitmap", () => {
    const changed = applyHandleDrag(
      documentWith(photo()),
      ["image"],
      "right",
      { x: -50, y: 0 },
      {
        crop: true,
      },
    );

    expect(changed.elements[0]).toMatchObject({
      width: 150,
      content: { offsetX: 0, offsetY: 0, scale: 1 },
    });
  });

  it("materializes a missing crop from the current Fit Mode so the first drag has a bitmap to pin", () => {
    const uncropped = photo({ content: undefined, fitMode: "contain", width: 100, height: 100 });
    expect(authoredImageContent(uncropped)).toEqual({
      offsetX: 0,
      offsetY: 25,
      scale: 0.5,
    });
  });

  it("does not record entering or leaving Crop Mode as an Undo Entry, and records each crop drag as one", () => {
    const start = documentWith(photo());
    const store = createEditorStore(start);
    let transitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) transitions += 1;
    });

    store.getState().enterCrop("image");
    expect(store.getState().croppingId).toBe("image");
    expect(store.getState().selected).toEqual(["image"]);
    expect(transitions).toBe(0);

    store.getState().leaveCrop();
    expect(store.getState().croppingId).toBeNull();
    expect(transitions).toBe(0);

    store.getState().enterCrop("image");
    store
      .getState()
      .commitPlacementEdit(
        (document) =>
          applyHandleDrag(document, ["image"], "right", { x: -40, y: 0 }, { crop: true }),
        ["image"],
      );
    expect(store.getState().document?.elements[0]).toMatchObject({ width: 160 });
    expect(transitions).toBe(1);

    store.getState().undo();
    expect(store.getState().document).toBe(start);
    expect(store.getState().croppingId).toBe("image");
  });
});
