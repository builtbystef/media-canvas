import type { ImageContent, ImageElement } from "@media-canvas/core";
import type { Handle, HandleDragOptions, Point } from "./resize-scale";

/** The authored crop, or the Fit Mode placement written as one so a crop
 *  drag has a bitmap to pin. Stretch cannot be stored as a uniform scale, so
 *  it falls back to cover. */
export function authoredImageContent(element: ImageElement): ImageContent {
  if (element.content) return element.content;
  const naturalWidth = element.naturalWidth;
  const naturalHeight = element.naturalHeight;
  if (naturalWidth <= 0 || naturalHeight <= 0) return { offsetX: 0, offsetY: 0, scale: 1 };
  const fit = element.fitMode === "contain" ? Math.min : Math.max;
  const scale = fit(element.width / naturalWidth, element.height / naturalHeight);
  return {
    offsetX: (element.width - naturalWidth * scale) / 2,
    offsetY: (element.height - naturalHeight * scale) / 2,
    scale,
  };
}

/** Resize the frame in Crop Mode: the opposite edge stays pinned and the
 *  bitmap keeps the same canvas position. */
export function cropImageFrame(
  element: ImageElement,
  handle: Handle,
  screenDelta: Point,
  options: HandleDragOptions = {},
): ImageElement {
  const content = authoredImageContent(element);
  const delta = toLocal(screenDelta, element.rotation);
  const resized = resizeFrame(element, handle, delta, options);
  if (resized === element) return { ...element, content };
  return {
    ...resized,
    content: {
      ...content,
      offsetX: element.x + content.offsetX - resized.x,
      offsetY: element.y + content.offsetY - resized.y,
    },
  };
}

/** Slide the bitmap under a still frame. The delta is in the element's local
 *  frame so a rotated photo follows the pointer. */
export function applyCropPan(element: ImageElement, screenDelta: Point): ImageElement {
  const content = authoredImageContent(element);
  const delta = toLocal(screenDelta, element.rotation);
  return {
    ...element,
    content: {
      ...content,
      offsetX: content.offsetX + delta.x,
      offsetY: content.offsetY + delta.y,
    },
  };
}

function resizeFrame(
  element: ImageElement,
  handle: Handle,
  delta: Point,
  options: HandleDragOptions,
): ImageElement {
  let left = includesLeft(handle) ? delta.x : 0;
  let right = includesRight(handle) ? delta.x : 0;
  let top = includesTop(handle) ? delta.y : 0;
  let bottom = includesBottom(handle) ? delta.y : 0;
  if (options.fromCenter) {
    if (includesLeft(handle)) right = -left;
    if (includesRight(handle)) left = -right;
    if (includesTop(handle)) bottom = -top;
    if (includesBottom(handle)) top = -bottom;
  }
  if (options.keepAspect) {
    const widthFactor = (element.width + right - left) / element.width;
    const heightFactor = (element.height + bottom - top) / element.height;
    const widthChanged = includesLeft(handle) || includesRight(handle);
    const heightChanged = includesTop(handle) || includesBottom(handle);
    const factor =
      !heightChanged || (widthChanged && Math.abs(widthFactor - 1) >= Math.abs(heightFactor - 1))
        ? widthFactor
        : heightFactor;
    const widthChange = element.width * (factor - 1);
    const heightChange = element.height * (factor - 1);
    [left, right] = edgeChanges(handle, "horizontal", widthChange, options.fromCenter);
    [top, bottom] = edgeChanges(handle, "vertical", heightChange, options.fromCenter);
  }
  const width = element.width + right - left;
  const height = element.height + bottom - top;
  if (width <= 0 || height <= 0) return element;
  const localCenterShift = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const centerShift = fromLocal(localCenterShift, element.rotation);
  const oldCenter = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  return {
    ...element,
    x: oldCenter.x + centerShift.x - width / 2,
    y: oldCenter.y + centerShift.y - height / 2,
    width,
    height,
  };
}

function edgeChanges(
  handle: Handle,
  axis: "horizontal" | "vertical",
  change: number,
  fromCenter = false,
): [number, number] {
  const atStart = axis === "horizontal" ? includesLeft(handle) : includesTop(handle);
  const atEnd = axis === "horizontal" ? includesRight(handle) : includesBottom(handle);
  if (fromCenter) return [-change / 2, change / 2];
  if (atStart) return [-change, 0];
  if (atEnd) return [0, change];
  return [-change / 2, change / 2];
}

function toLocal(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) + point.y * Math.sin(radians),
    y: -point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function fromLocal(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function includesLeft(handle: Handle): boolean {
  return handle === "left" || handle === "top-left" || handle === "bottom-left";
}
function includesRight(handle: Handle): boolean {
  return handle === "right" || handle === "top-right" || handle === "bottom-right";
}
function includesTop(handle: Handle): boolean {
  return handle === "top" || handle === "top-left" || handle === "top-right";
}
function includesBottom(handle: Handle): boolean {
  return handle === "bottom" || handle === "bottom-left" || handle === "bottom-right";
}
