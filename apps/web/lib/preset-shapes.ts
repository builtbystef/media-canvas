import type { VectorElement } from "@media-canvas/core";
import { placedImageSize, type Point, type Size } from "./image-placement";

export const PRESET_SHAPE_DRAG_TYPE = "application/x-media-canvas-preset-shape";

export type PresetShapeName = "star" | "arrow" | "triangle" | "line";

export type PresetShape = {
  name: PresetShapeName;
  label: string;
  path: string;
  viewBox: { width: number; height: number };
  fill: string;
  border?: { color: string; width: number };
};

export const PRESET_SHAPES: readonly PresetShape[] = [
  {
    name: "star",
    label: "Star",
    path: "M 50 2 L 60.58 35.44 L 95.65 35.17 L 67.13 55.56 L 78.21 88.83 L 50 68 L 21.79 88.83 L 32.87 55.56 L 4.35 35.17 L 39.42 35.44 Z",
    viewBox: { width: 100, height: 100 },
    fill: "#D9D9D9",
  },
  {
    name: "arrow",
    label: "Arrow",
    path: "M 0 30 H 55 V 5 L 100 50 L 55 95 V 70 H 0 Z",
    viewBox: { width: 100, height: 100 },
    fill: "#D9D9D9",
  },
  {
    name: "triangle",
    label: "Triangle",
    path: "M 50 4 L 96 92 L 4 92 Z",
    viewBox: { width: 100, height: 100 },
    fill: "#D9D9D9",
  },
  {
    name: "line",
    label: "Line",
    path: "M 0 0.5 H 100",
    viewBox: { width: 100, height: 1 },
    fill: "#00000000",
    border: { color: "#000000", width: 2 },
  },
];

export function serializePresetShapeDrag(name: PresetShapeName): string {
  return name;
}

export function parsePresetShapeDrag(raw: string): PresetShapeName | null {
  return PRESET_SHAPES.some((shape) => shape.name === raw) ? (raw as PresetShapeName) : null;
}

export function presetShapeElement(
  id: string,
  name: PresetShapeName,
  drop: Point,
  canvas: Size,
): VectorElement {
  const shape = PRESET_SHAPES.find((item) => item.name === name);
  if (shape === undefined) {
    throw new Error(`Unknown Preset Shape: ${name}`);
  }
  const placed = placedImageSize(shape.viewBox, canvas);
  return {
    id,
    type: "vector",
    x: drop.x,
    y: drop.y,
    width: placed.width,
    height: placed.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    path: shape.path,
    viewBox: { width: shape.viewBox.width, height: shape.viewBox.height },
    fill: shape.fill,
    ...(shape.border === undefined ? {} : { border: shape.border }),
  };
}
