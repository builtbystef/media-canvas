import type { DesignDocument, RectElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "./editor-store";
import {
  alignElements,
  distributeElements,
  normalizeRotation,
  rotateElements,
  snapBounds,
  snapResizeBounds,
  type ElementBounds,
} from "./placement";

const base = {
  type: "rect" as const,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  opacity: 1,
  visible: true as const,
  fill: "#000000",
};
const rect = (id: string, x: number, rotation = 0): RectElement => ({ ...base, id, x, rotation });
const documentWith = (...elements: RectElement[]): DesignDocument => ({
  schemaVersion: 1,
  canvas: { width: 100, height: 100, background: "#FFFFFF" },
  elements,
});
const bounds = (
  id: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): ElementBounds => ({ id, left, top, right, bottom });

describe("rotation, snapping, and alignment", () => {
  it("normalizes rotation into one turn and snaps the rotation delta to fifteen degrees", () => {
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(-10)).toBe(350);
    const changed = rotateElements(documentWith(rect("one", 0, 350)), ["one"], 20, new Map());
    expect(changed.elements[0]).toMatchObject({ rotation: 10 });
    const snapped = rotateElements(documentWith(rect("one", 0, 1)), ["one"], 16, new Map(), true);
    expect(snapped.elements[0]).toMatchObject({ rotation: 15 });
  });

  it("rotates a multiple selection around its union centre", () => {
    const changed = rotateElements(
      documentWith(rect("one", 0), rect("two", 20)),
      ["one", "two"],
      90,
      new Map([
        ["one", bounds("one", 0, 0, 10, 10)],
        ["two", bounds("two", 20, 0, 30, 10)],
      ]),
    );
    expect(changed.elements).toMatchObject([
      { x: 10, y: -10, rotation: 90 },
      { x: 10, y: 10, rotation: 90 },
    ]);
  });

  it("snaps axis-aligned bounds to canvas and neighbour edges or centres in screen space", () => {
    const canvasCentre = snapBounds(
      bounds("moving", 44.5, 20, 54.5, 30),
      { width: 100, height: 100 },
      [],
      2,
    );
    expect(canvasCentre).toEqual({ dx: 0.5, dy: 0, guides: [{ axis: "x", position: 50 }] });

    const neighbour = snapBounds(
      bounds("moving", 69, 39, 79, 49),
      { width: 100, height: 100 },
      [bounds("other", 80, 40, 100, 60)],
      1,
    );
    expect(neighbour).toEqual({
      dx: 1,
      dy: 1,
      guides: [
        { axis: "x", position: 80 },
        { axis: "y", position: 40 },
      ],
    });
    expect(
      snapBounds(bounds("moving", 44.5, 20, 54.5, 30), { width: 100, height: 100 }, [], 2, true),
    ).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("snaps the moving resize edge even when the opposite edge is already aligned", () => {
    const snapped = snapResizeBounds(
      bounds("moving", 0, 0, 49, 20),
      "right",
      { width: 100, height: 100 },
      [],
      1,
    );
    expect(snapped).toEqual({ dx: 1, dy: 0, guides: [{ axis: "x", position: 50 }] });
  });

  it("aligns one Element to canvas and selections by axis-aligned mounted bounds", () => {
    const one = alignElements(
      documentWith(rect("one", 20)),
      ["one"],
      "right",
      new Map([["one", bounds("one", 20, 0, 30, 10)]]),
    );
    expect(one.elements[0]).toMatchObject({ x: 90 });

    const many = alignElements(
      documentWith(rect("one", 0), rect("two", 40)),
      ["one", "two"],
      "center-horizontal",
      new Map([
        ["one", bounds("one", 0, 0, 10, 10)],
        ["two", bounds("two", 40, 0, 60, 10)],
      ]),
    );
    expect(many.elements).toMatchObject([{ x: 25 }, { x: 20 }]);
  });

  it("distributes three Elements with the outer two unmoved", () => {
    const changed = distributeElements(
      documentWith(rect("one", 0), rect("two", 10), rect("three", 100)),
      ["one", "two", "three"],
      "horizontal",
      new Map([
        ["one", bounds("one", 0, 0, 10, 10)],
        ["two", bounds("two", 10, 0, 20, 10)],
        ["three", bounds("three", 100, 0, 110, 10)],
      ]),
    );
    expect(changed.elements).toMatchObject([{ x: 0 }, { x: 50 }, { x: 100 }]);
  });

  it("commits a rotation or alignment through one store transition", () => {
    const store = createEditorStore(documentWith(rect("one", 0, 350)));
    let transitions = 0;
    store.subscribe((state, previous) => {
      if (state.document !== previous.document) transitions += 1;
    });
    store
      .getState()
      .commitPlacementEdit((document) => rotateElements(document, ["one"], 20, new Map()), ["one"]);
    expect(store.getState().document?.elements[0]).toMatchObject({ rotation: 10 });
    expect(store.getState().selected).toEqual(["one"]);
    expect(transitions).toBe(1);
  });
});
