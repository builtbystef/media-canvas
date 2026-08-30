import type { ImageElement } from "@media-canvas/core";

export const IMAGE_ASSET_DRAG_TYPE = "application/x-media-canvas-image-asset";

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export type ImageAssetRef = {
  id: string;
  width: number;
  height: number;
  url: string;
};

export type ImagePlaceholder = {
  id: string;
  x: number;
  y: number;
  status: "uploading" | "failed";
  message?: string;
};

export type ImageDropSource =
  | { kind: "asset"; id: string; width: number; height: number; url: string }
  | { kind: "file"; file: File };

export type ImageDropResult =
  | { ok: true; asset: Size & { id: string }; elementId: string; canvas: Size }
  | { ok: false; message: string };

export type FinishedImageDrop =
  | { kind: "placed"; element: ImageElement }
  | { kind: "rejected"; message: string };

export function serializeImageAssetDrag(asset: ImageAssetRef): string {
  return JSON.stringify(asset);
}

export function placedImageSize(natural: Size, canvas: Size): Size & { scale: number } {
  if (natural.width <= 0 || natural.height <= 0) {
    return { width: 0, height: 0, scale: 1 };
  }
  const scale = Math.min(1, canvas.width / natural.width, canvas.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale, scale };
}

export function imageElementFromAsset(
  id: string,
  asset: { id: string; width: number; height: number },
  drop: Point,
  canvas: Size,
): ImageElement {
  const placed = placedImageSize(asset, canvas);
  return {
    id,
    type: "image",
    x: drop.x,
    y: drop.y,
    width: placed.width,
    height: placed.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    src: asset.id,
    naturalWidth: asset.width,
    naturalHeight: asset.height,
    content: { offsetX: 0, offsetY: 0, scale: placed.scale },
    fitMode: "cover",
    clip: "none",
  };
}

export function startPlaceholder(id: string, drop: Point): ImagePlaceholder {
  return { id, x: drop.x, y: drop.y, status: "uploading" };
}

export function failPlaceholder(placeholder: ImagePlaceholder, message: string): ImagePlaceholder {
  return { ...placeholder, status: "failed", message };
}

export function finishImageDrop(
  placeholder: ImagePlaceholder,
  result: ImageDropResult,
): FinishedImageDrop {
  if (!result.ok) return { kind: "rejected", message: result.message };
  return {
    kind: "placed",
    element: imageElementFromAsset(result.elementId, result.asset, placeholder, result.canvas),
  };
}

export function refusalMessage(error: unknown): string {
  if (error && typeof error === "object" && "error" in error) {
    const inner = (error as { error?: { message?: unknown } }).error;
    if (inner && typeof inner.message === "string" && inner.message.length > 0) {
      return inner.message;
    }
  }
  return "The app could not be reached. Check your connection, then try again.";
}

export function canAcceptImageDrop(data: { types?: readonly string[] }): boolean {
  return (
    data.types?.includes(IMAGE_ASSET_DRAG_TYPE) === true || data.types?.includes("Files") === true
  );
}

export function imageSourcesFromDrop(data: {
  files?: FileList | readonly File[];
  types?: readonly string[];
  getData?: (type: string) => string;
}): ImageDropSource[] {
  if (data.types?.includes(IMAGE_ASSET_DRAG_TYPE) && data.getData) {
    const asset = parseImageAssetDrag(data.getData(IMAGE_ASSET_DRAG_TYPE));
    return asset === null ? [] : [{ kind: "asset", ...asset }];
  }
  return [...(data.files ?? [])]
    .filter(isRasterFile)
    .map((file) => ({ kind: "file" as const, file }));
}

function parseImageAssetDrag(raw: string): ImageAssetRef | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { id, width, height, url } = value as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      typeof url !== "string"
    ) {
      return null;
    }
    return { id, width, height, url };
  } catch {
    return null;
  }
}

function isRasterFile(file: File): boolean {
  if (file.type === "image/svg+xml") return false;
  return file.type.startsWith("image/");
}
