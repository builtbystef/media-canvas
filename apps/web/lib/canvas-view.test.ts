import { expect, test } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  type CanvasView,
  type ViewStore,
  clampZoom,
  fitZoom,
  readView,
  writeView,
  zoomAt,
  zoomBy,
} from "./canvas-view.ts";

/** `localStorage` as far as anything here is concerned. */
function store(entries: Record<string, string> = {}): ViewStore & { held: Map<string, string> } {
  const held = new Map(Object.entries(entries));
  return {
    held,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
  };
}

test("zoom stays between 5% and 1600%, whatever it is asked for", () => {
  expect(clampZoom(0.001)).toBe(MIN_ZOOM);
  expect(clampZoom(100)).toBe(MAX_ZOOM);
  expect(clampZoom(0.5)).toBe(0.5);
  expect(clampZoom(Number.NaN)).toBe(1);
});

test("fitting shows the whole canvas with room around it", () => {
  const fitted = fitZoom({ width: 1080, height: 1080 }, { width: 800, height: 600 });

  expect(fitted * 1080).toBeLessThanOrEqual(600);
  expect(fitted).toBeGreaterThan(0.4);
});

test("fitting a canvas smaller than the view does not blow it up past its own size", () => {
  // Nothing here says a small canvas must fill the view; what it must not do
  // is exceed the zoom range or the room it was given.
  const fitted = fitZoom({ width: 200, height: 100 }, { width: 1600, height: 1200 });

  expect(fitted).toBeLessThanOrEqual(MAX_ZOOM);
  expect(fitted * 200).toBeLessThanOrEqual(1600);
});

test("a canvas far larger than the view still lands on a zoom that can be used", () => {
  const fitted = fitZoom({ width: 2480, height: 3508 }, { width: 300, height: 200 });

  expect(fitted).toBeGreaterThanOrEqual(MIN_ZOOM);
  expect(fitted * 3508).toBeLessThanOrEqual(200);
});

test("a wheel in and the same wheel back out land on the zoom they started at", () => {
  const stepped = zoomBy(zoomBy(1, -120), 120);

  expect(stepped).toBeCloseTo(1, 10);
});

test("a wheel towards the screen zooms in, away from it zooms out, and neither leaves the range", () => {
  expect(zoomBy(1, -120)).toBeGreaterThan(1);
  expect(zoomBy(1, 120)).toBeLessThan(1);
  expect(zoomBy(MAX_ZOOM, -10_000)).toBe(MAX_ZOOM);
  expect(zoomBy(MIN_ZOOM, 10_000)).toBe(MIN_ZOOM);
});

test("zooming at the cursor keeps the document point under it where it was", () => {
  const view: CanvasView = { zoom: 1, left: 0, top: 0 };
  // The canvas's top-left sits 50 px in from the view's, and the pointer is
  // 150 px in: the document point under it is (100, 100).
  const pointer = { x: 150, y: 150 };
  const origin = { x: 50, y: 50 };

  const zoomed = zoomAt(view, 2, pointer, origin);

  // At twice the size that point is 200 px from the canvas's top-left, so the
  // view has to have scrolled 100 px further to keep it under the pointer.
  expect(zoomed).toEqual({ zoom: 2, left: 100, top: 100 });
});

test("zooming at the cursor honours the range, and scrolls only as far as the zoom it got", () => {
  const view: CanvasView = { zoom: MAX_ZOOM, left: 0, top: 0 };

  const zoomed = zoomAt(view, 1000, { x: 100, y: 100 }, { x: 0, y: 0 });

  expect(zoomed).toEqual({ zoom: MAX_ZOOM, left: 0, top: 0 });
});

test("a document's view is remembered under its own id, and read back", () => {
  const held = store();
  const view: CanvasView = { zoom: 0.75, left: 120, top: 40 };

  writeView(held, "doc-a", view);

  expect(readView(held, "doc-a")).toEqual(view);
  expect(readView(held, "doc-b")).toBeNull();
});

test("a view nothing sensible was stored for is no view at all, not a broken one", () => {
  expect(readView(store({ "media-canvas:view:doc": "not json" }), "doc")).toBeNull();
  expect(readView(store({ "media-canvas:view:doc": '{"zoom":"big"}' }), "doc")).toBeNull();
  expect(readView(store({ "media-canvas:view:doc": "null" }), "doc")).toBeNull();
});

test("a remembered zoom outside the range is brought back into it", () => {
  const held = store({ "media-canvas:view:doc": '{"zoom":9000,"left":0,"top":0}' });

  expect(readView(held, "doc")?.zoom).toBe(MAX_ZOOM);
});
