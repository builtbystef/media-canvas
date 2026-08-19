/**
 * How the canvas is looked at: the zoom, and where the view is scrolled to.
 *
 * None of it belongs to the Design Document — the schema has no field for a
 * view, and the worker renders the same markup whatever the editor is zoomed
 * to (node ep90f3). Zoom is a transform on a wrapper around the compiled
 * markup, never a recompile at another scale, so the memo caches (ADR-0006)
 * survive every zoom change. It is remembered per document in the browser it
 * was set in, and nowhere else.
 */

/** The range the interaction model settles: 5% to 1600%. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

/** Room left around the canvas when the whole of it is fitted in the view. */
const FIT_MARGIN = 48;

export type CanvasView = {
  /** 1 draws the canvas at its own pixel size. */
  zoom: number;
  /** Where the view is scrolled to, in view pixels. */
  left: number;
  top: number;
};

export type Extent = { width: number; height: number };
export type Point = { x: number; y: number };

/** Somewhere to remember a view between visits: `localStorage`, or anything
 *  that answers like it. */
export type ViewStore = Pick<Storage, "getItem" | "setItem">;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The zoom that shows the whole canvas, with a margin around it.
 *
 * A document opened for the first time lands here, and it is what a canvas
 * larger than the window needs to be seen at all. A viewport too small to hold
 * anything still yields a usable zoom rather than nothing.
 */
export function fitZoom(canvas: Extent, viewport: Extent): number {
  const width = Math.max(1, viewport.width - FIT_MARGIN * 2);
  const height = Math.max(1, viewport.height - FIT_MARGIN * 2);
  if (canvas.width <= 0 || canvas.height <= 0) return 1;
  return clampZoom(Math.min(width / canvas.width, height / canvas.height));
}

/**
 * The zoom a wheel or a pinch asks for.
 *
 * Exponential in the wheel's delta, so that a step in and the same step back
 * out land where they started, and so that the same gesture feels the same at
 * 10% as at 800%.
 */
export function zoomBy(zoom: number, delta: number): number {
  return clampZoom(zoom * Math.exp(-delta / 400));
}

/**
 * Zooming at the cursor: the document point under the pointer stays under it.
 *
 * `pointer` and `origin` are both measured from the top-left of the scrolling
 * view — `origin` being where the canvas's own top-left currently sits, which
 * is what the zoom moves.
 */
export function zoomAt(view: CanvasView, zoom: number, pointer: Point, origin: Point): CanvasView {
  const next = clampZoom(zoom);
  const held = { x: (pointer.x - origin.x) / view.zoom, y: (pointer.y - origin.y) / view.zoom };
  return {
    zoom: next,
    left: view.left + (held.x * next - (pointer.x - origin.x)),
    top: view.top + (held.y * next - (pointer.y - origin.y)),
  };
}

/** The view a document was last looked at with, if this browser remembers one.
 *  Anything else stored under the key is treated as nothing remembered: a view
 *  is a convenience, and never a reason to refuse to open a document. */
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
