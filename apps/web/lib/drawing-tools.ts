import type { EllipseElement, RectElement, TextElement } from "@media-canvas/core";

export type Tool = "select" | "text" | "rect" | "ellipse" | "hand";
export type DrawTool = Extract<Tool, "text" | "rect" | "ellipse">;
export type Point = { x: number; y: number };
export type DrawingBounds = { left: number; top: number; right: number; bottom: number };

export const DEFAULT_FONT_ASSET_ID =
  "3e5f90a0138b38de4cf4d779ad78391974ea1df776b9164842bdcbb60ce383c5";

export function toolForKey(key: string): Tool | null {
  return (
    (
      {
        v: "select",
        t: "text",
        r: "rect",
        o: "ellipse",
        h: "hand",
      } as const
    )[key.toLowerCase()] ?? null
  );
}

export function drawingBounds(
  start: Point,
  current: Point,
  constrained = false,
  fromCenter = false,
): DrawingBounds {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (constrained) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }
  const opposite = fromCenter ? { x: start.x - dx, y: start.y - dy } : start;
  return {
    left: Math.min(opposite.x, start.x + dx),
    top: Math.min(opposite.y, start.y + dy),
    right: Math.max(opposite.x, start.x + dx),
    bottom: Math.max(opposite.y, start.y + dy),
  };
}

export function createDrawnElement(
  tool: DrawTool,
  id: string,
  start: Point,
  current: Point,
  constrained = false,
  fromCenter = false,
): RectElement | EllipseElement | TextElement {
  const bounds = drawingBounds(start, current, constrained && tool !== "text", fromCenter);
  const clicked = start.x === current.x && start.y === current.y;
  const base = {
    id,
    x: bounds.left,
    y: bounds.top,
    rotation: 0,
    opacity: 1,
    visible: true as const,
  };
  if (tool === "text") {
    return {
      ...base,
      type: "text",
      width: clicked ? 300 : bounds.right - bounds.left,
      content: "",
      fontAssetId: DEFAULT_FONT_ASSET_ID,
      fontSize: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: "left",
      anchor: "top",
      color: "#000000",
    };
  }
  return {
    ...base,
    type: tool,
    width: clicked ? 100 : bounds.right - bounds.left,
    height: clicked ? 100 : bounds.bottom - bounds.top,
    fill: "#D9D9D9",
  };
}
