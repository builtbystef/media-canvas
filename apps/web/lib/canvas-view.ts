export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

const FIT_MARGIN = 48;

export type CanvasView = {
  zoom: number;
  left: number;
  top: number;
};

export type Extent = { width: number; height: number };
export type Point = { x: number; y: number };

export type ViewStore = Pick<Storage, "getItem" | "setItem">;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function fitZoom(canvas: Extent, viewport: Extent): number {
  const width = Math.max(1, viewport.width - FIT_MARGIN * 2);
  const height = Math.max(1, viewport.height - FIT_MARGIN * 2);
  if (canvas.width <= 0 || canvas.height <= 0) return 1;
  return clampZoom(Math.min(width / canvas.width, height / canvas.height));
}

export function zoomBy(zoom: number, delta: number): number {
  return clampZoom(zoom * Math.exp(-delta / 400));
}

export function zoomAt(view: CanvasView, zoom: number, pointer: Point, origin: Point): CanvasView {
  const next = clampZoom(zoom);
  const held = { x: (pointer.x - origin.x) / view.zoom, y: (pointer.y - origin.y) / view.zoom };
  return {
    zoom: next,
    left: view.left + (held.x * next - (pointer.x - origin.x)),
    top: view.top + (held.y * next - (pointer.y - origin.y)),
  };
}

export function readView(store: ViewStore, documentId: string): CanvasView | null {
  const stored = store.getItem(viewKey(documentId));
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { zoom, left, top } = parsed as Partial<CanvasView>;
    if (!isNumber(zoom) || !isNumber(left) || !isNumber(top)) return null;
    return { zoom: clampZoom(zoom), left, top };
  } catch {
    return null;
  }
}

export function writeView(store: ViewStore, documentId: string, view: CanvasView): void {
  store.setItem(viewKey(documentId), JSON.stringify(view));
}

function viewKey(documentId: string): string {
  return `media-canvas:view:${documentId}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
