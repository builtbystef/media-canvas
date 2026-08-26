import { describe, expect, it } from "vitest";
import { canAcceptCanvasDrop, canvasDropSources } from "./canvas-drop";
import { IMAGE_ASSET_DRAG_TYPE, serializeImageAssetDrag } from "./image-placement";
import { PRESET_SHAPE_DRAG_TYPE, serializePresetShapeDrag } from "./preset-shapes";

describe("canvas drop sources", () => {
  it("routes a Shapes-panel drag, an Assets-panel drag, a raster file, and an SVG file through one classifier", () => {
    const asset = { id: "asset-1", width: 800, height: 600, url: "/images/asset-1.png" };
    expect(
      canvasDropSources({
        types: [PRESET_SHAPE_DRAG_TYPE],
        getData: (type) =>
          type === PRESET_SHAPE_DRAG_TYPE ? serializePresetShapeDrag("star") : "",
      }),
    ).toEqual([{ kind: "preset-shape", name: "star" }]);

    expect(
      canvasDropSources({
        types: [IMAGE_ASSET_DRAG_TYPE],
        getData: (type) => (type === IMAGE_ASSET_DRAG_TYPE ? serializeImageAssetDrag(asset) : ""),
      }),
    ).toEqual([{ kind: "image-asset", ...asset }]);

    const png = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    const svg = new File(["<svg viewBox='0 0 1 1'/>"], "icon.svg", { type: "image/svg+xml" });
    expect(canvasDropSources({ files: [png, svg], types: ["Files"] })).toEqual([
      { kind: "raster-file", file: png },
      { kind: "svg-file", file: svg },
    ]);
  });

  it("accepts those four payloads and ignores anything else", () => {
    expect(canAcceptCanvasDrop({ types: [PRESET_SHAPE_DRAG_TYPE] })).toBe(true);
    expect(canAcceptCanvasDrop({ types: [IMAGE_ASSET_DRAG_TYPE] })).toBe(true);
    expect(canAcceptCanvasDrop({ types: ["Files"] })).toBe(true);
    expect(canAcceptCanvasDrop({ types: ["text/plain"] })).toBe(false);
  });
});
