import type { DesignDocument } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import {
  IMAGE_ASSET_DRAG_TYPE,
  canAcceptImageDrop,
  failPlaceholder,
  finishImageDrop,
  imageElementFromAsset,
  imageSourcesFromDrop,
  placedImageSize,
  refusalMessage,
  serializeImageAssetDrag,
  startPlaceholder,
} from "./image-placement";

const canvas = { width: 1000, height: 800 };

describe("image placement", () => {
  it("sizes a dropped asset from its real dimensions and scales it down to fit the canvas", () => {
    expect(placedImageSize({ width: 2000, height: 1000 }, canvas)).toEqual({
      width: 1000,
      height: 500,
      scale: 0.5,
    });
    expect(placedImageSize({ width: 100, height: 80 }, canvas)).toEqual({
      width: 100,
      height: 80,
      scale: 1,
    });
  });

  it("places an existing Image Asset at the drop point with no upload", () => {
    const element = imageElementFromAsset(
      "el-1",
      { id: "asset-1", width: 2000, height: 1000 },
      { x: 40, y: 60 },
      canvas,
    );

    expect(element).toMatchObject({
      id: "el-1",
      type: "image",
      x: 40,
      y: 60,
      width: 1000,
      height: 500,
      src: "asset-1",
      naturalWidth: 2000,
      naturalHeight: 1000,
      content: { offsetX: 0, offsetY: 0, scale: 0.5 },
      fitMode: "cover",
      clip: "none",
      rotation: 0,
      opacity: 1,
      visible: true,
    });
  });

  it("reads a panel drag as an existing asset and a raster file as an upload", () => {
    const asset = { id: "asset-1", width: 800, height: 600, url: "/images/asset-1.png" };
    const fromPanel = imageSourcesFromDrop({
      types: [IMAGE_ASSET_DRAG_TYPE],
      getData: (type) => (type === IMAGE_ASSET_DRAG_TYPE ? serializeImageAssetDrag(asset) : ""),
      files: [],
    });
    expect(fromPanel).toEqual([{ kind: "asset", ...asset }]);

    const png = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    const svg = new File(["<svg/>"], "icon.svg", { type: "image/svg+xml" });
    expect(imageSourcesFromDrop({ files: [png, svg], types: ["Files"] })).toEqual([
      { kind: "file", file: png },
    ]);
    expect(canAcceptImageDrop({ types: [IMAGE_ASSET_DRAG_TYPE] })).toBe(true);
    expect(canAcceptImageDrop({ types: ["Files"] })).toBe(true);
    expect(canAcceptImageDrop({ types: ["text/plain"] })).toBe(false);
  });

  it("turns a successful upload into an image element at the placeholder and removes it", () => {
    const placeholder = startPlaceholder("ph-1", { x: 10, y: 20 });
    const finished = finishImageDrop(placeholder, {
      ok: true,
      asset: { id: "asset-9", width: 100, height: 80 },
      elementId: "el-9",
      canvas,
    });

    expect(finished).toEqual({
      kind: "placed",
      element: imageElementFromAsset(
        "el-9",
        { id: "asset-9", width: 100, height: 80 },
        { x: 10, y: 20 },
        canvas,
      ),
    });
  });

  it("removes a rejected upload's placeholder and shows the api's own words", () => {
    const placeholder = startPlaceholder("ph-1", { x: 10, y: 20 });
    const message =
      "Only PNG, JPEG and WebP images can be used. Convert this file to one of those — or, if it is an SVG, import it as vector artwork instead.";
    const finished = finishImageDrop(placeholder, {
      ok: false,
      message: refusalMessage({ error: { code: "unsupported_image_format", message } }),
    });

    expect(finished).toEqual({ kind: "rejected", message });
    expect(failPlaceholder(placeholder, message)).toMatchObject({
      id: "ph-1",
      status: "failed",
      message,
    });
  });

  it("commits a placed image as one store transition", () => {
    const document: DesignDocument = {
      schemaVersion: 1,
      canvas: { width: 1000, height: 800, background: "#FFFFFF" },
      elements: [],
    };
    const store = createEditorStore(document);
    const element = imageElementFromAsset(
      "el-1",
      { id: "asset-1", width: 100, height: 80 },
      { x: 0, y: 0 },
      canvas,
    );
    store.getState().createElement(element);

    expect(store.getState().document?.elements).toEqual([element]);
    expect(store.getState().selected).toEqual(["el-1"]);
    store.getState().undo();
    expect(store.getState().document).toBe(document);
  });
});
