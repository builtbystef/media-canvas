import { DESIGN_DOCUMENT_SCHEMA_VERSION, type DesignDocument } from "@media-canvas/core";

/**
 * The sizes a new design can start at, and the document it starts as.
 *
 * A Canvas Preset is a name and a pair of dimensions and nothing else, so the
 * list is a constant here rather than anything the api knows about. Creating
 * is the only way a document is born, which is why the starting document is
 * defined in one place.
 */

export type CanvasPreset = { name: string; width: number; height: number };

/** The six the spec names, in the order the dialog offers them. */
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { name: "Instagram post", width: 1080, height: 1080 },
  { name: "Instagram story", width: 1080, height: 1920 },
  { name: "Facebook post", width: 1200, height: 630 },
  { name: "X post", width: 1600, height: 900 },
  { name: "A4 poster", width: 2480, height: 3508 },
  { name: "Full HD", width: 1920, height: 1080 },
];

/** What an unnamed document is called until somebody renames it. */
export const UNTITLED = "Untitled";

/** A design at that size: a white canvas and nothing on it. */
export function blankDesign(width: number, height: number): DesignDocument {
  return {
    schemaVersion: DESIGN_DOCUMENT_SCHEMA_VERSION,
    canvas: { width, height, background: "#ffffff" },
    elements: [],
  };
}

/**
 * A typed-in dimension as pixels, or nothing if it is not one.
 *
 * Coordinates are px with the canvas as the export size (node 53lwlc), so a
 * fractional or absent side is not a canvas anybody can export; the smallest
 * one that is, is a pixel.
 */
export function readDimension(typed: string): number | null {
  const trimmed = typed.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const pixels = Number(trimmed);
  return pixels >= 1 ? pixels : null;
}
