import { IMAGE_ASSET_DRAG_TYPE, imageSourcesFromDrop, type ImageAssetRef } from "./image-placement";
import {
  PRESET_SHAPE_DRAG_TYPE,
  parsePresetShapeDrag,
  type PresetShapeName,
} from "./preset-shapes";

export type CanvasDropSource =
  | { kind: "preset-shape"; name: PresetShapeName }
  | ({ kind: "image-asset" } & ImageAssetRef)
  | { kind: "raster-file"; file: File }
  | { kind: "svg-file"; file: File };

export function canAcceptCanvasDrop(data: { types?: readonly string[] }): boolean {
  return (
    data.types?.includes(PRESET_SHAPE_DRAG_TYPE) === true ||
    data.types?.includes(IMAGE_ASSET_DRAG_TYPE) === true ||
    data.types?.includes("Files") === true
  );
}

export function canvasDropSources(data: {
  files?: FileList | readonly File[];
  types?: readonly string[];
  getData?: (type: string) => string;
}): CanvasDropSource[] {
  if (data.types?.includes(PRESET_SHAPE_DRAG_TYPE) && data.getData) {
    const name = parsePresetShapeDrag(data.getData(PRESET_SHAPE_DRAG_TYPE));
    return name === null ? [] : [{ kind: "preset-shape", name }];
  }
  if (data.types?.includes(IMAGE_ASSET_DRAG_TYPE)) {
    return imageSourcesFromDrop(data).flatMap((source) =>
      source.kind === "asset"
        ? [
            {
              kind: "image-asset" as const,
              id: source.id,
              width: source.width,
              height: source.height,
              url: source.url,
            },
          ]
        : [],
    );
  }
  return [...(data.files ?? [])].flatMap((file): CanvasDropSource[] => {
    if (isSvgFile(file)) return [{ kind: "svg-file", file }];
    if (file.type.startsWith("image/")) return [{ kind: "raster-file", file }];
    return [];
  });
}

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}
