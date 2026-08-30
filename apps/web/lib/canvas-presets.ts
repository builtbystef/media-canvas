import { DESIGN_DOCUMENT_SCHEMA_VERSION, type DesignDocument } from "@media-canvas/core";

export type CanvasPreset = { name: string; width: number; height: number };

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { name: "Instagram post", width: 1080, height: 1080 },
  { name: "Instagram story", width: 1080, height: 1920 },
  { name: "Facebook post", width: 1200, height: 630 },
  { name: "X post", width: 1600, height: 900 },
  { name: "A4 poster", width: 2480, height: 3508 },
  { name: "Full HD", width: 1920, height: 1080 },
];

export const UNTITLED = "Untitled";

export function blankDesign(width: number, height: number): DesignDocument {
  return {
    schemaVersion: DESIGN_DOCUMENT_SCHEMA_VERSION,
    canvas: { width, height, background: "#ffffff" },
    elements: [],
  };
}

export function readDimension(typed: string): number | null {
  const trimmed = typed.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const pixels = Number(trimmed);
  return pixels >= 1 ? pixels : null;
}
