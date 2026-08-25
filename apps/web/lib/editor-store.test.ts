import type { DesignDocument, RectElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { moveElements } from "./document-operations";
import { createEditorStore } from "./editor-store";

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

function rect(id: string, x: number): RectElement {
  return { ...base, id, x };
}

function documentWith(...elements: RectElement[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements,
  };
}

function undoUntilStable(store: ReturnType<typeof createEditorStore>): number {
  let undos = 0;
  while (true) {
    const before = store.getState().document;
    store.getState().undo();
    if (store.getState().document === before) return undos;
    undos += 1;
  }
}

describe("undo and redo", () => {
  it("records a 120-frame drag as one Undo Entry", () => {
    const start = documentWith(rect("one", 10), rect("two", 40));
    const store = createEditorStore(start);

    for (let frame = 1; frame <= 120; frame += 1) {
      store.getState().replaceDocument(() => moveElements(start, ["one"], frame, 0));
    }
    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 120, 0), ["one"], start);

    expect(store.getState().document?.elements[0]).toMatchObject({ x: 130 });
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
  });

  it("records a three-element move as one entry, not three", () => {
    const start = documentWith(rect("a", 0), rect("b", 10), rect("c", 20));
    const store = createEditorStore(start);

    store
      .getState()
      .commitPlacementEdit(
        (document) => moveElements(document, ["a", "b", "c"], 5, 0),
        ["a", "b", "c"],
      );

    expect(store.getState().document?.elements).toMatchObject([{ x: 5 }, { x: 15 }, { x: 25 }]);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
  });

  it("restores both positions and selects exactly the two elements a move touched", () => {
    const start = documentWith(rect("one", 0), rect("two", 20), rect("other", 80));
    const store = createEditorStore(start);
    store.getState().select(["other"]);

    store
      .getState()
      .commitPlacementEdit(
        (document) => moveElements(document, ["one", "two"], 8, 3),
        ["one", "two"],
      );

    expect(store.getState().document?.elements).toMatchObject([
      { x: 8, y: 3 },
      { x: 28, y: 3 },
      { x: 80, y: 0 },
    ]);
    store.getState().undo();

    expect(store.getState().document).toBe(start);
    expect(store.getState().selected).toEqual(["one", "two"]);
  });

  it("never records a selection change as an entry", () => {
    const start = documentWith(rect("one", 0), rect("two", 20));
    const store = createEditorStore(start);

    store.getState().select(["one"]);
    store.getState().select(["one", "two"]);
    store.getState().select([]);

    expect(undoUntilStable(store)).toBe(0);
    expect(store.getState().document).toBe(start);
  });

  it("clears the redo side when a new edit lands after an undo", () => {
    const start = documentWith(rect("one", 0));
    const store = createEditorStore(start);
    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 10, 0), ["one"]);
    const afterFirst = store.getState().document;
    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 10, 0), ["one"]);
    store.getState().undo();
    expect(store.getState().document).toBe(afterFirst);

    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 0, 7), ["one"]);
    const afterThird = store.getState().document;
    store.getState().redo();

    expect(store.getState().document).toBe(afterThird);
    expect(store.getState().document?.elements[0]).toMatchObject({ x: 10, y: 7 });
  });

  it("redoes the entry it just undid and restores that selection", () => {
    const start = documentWith(rect("one", 0), rect("two", 20));
    const store = createEditorStore(start);
    store
      .getState()
      .commitPlacementEdit(
        (document) => moveElements(document, ["one", "two"], 4, 0),
        ["one", "two"],
      );
    const moved = store.getState().document;
    store.getState().select([]);
    store.getState().undo();
    store.getState().redo();

    expect(store.getState().document).toBe(moved);
    expect(store.getState().selected).toEqual(["one", "two"]);
  });

  it("drops the oldest entry once the stack holds two hundred", () => {
    const start = documentWith(rect("one", 0));
    const store = createEditorStore(start);
    for (let step = 1; step <= 201; step += 1) {
      store
        .getState()
        .commitPlacementEdit((document) => moveElements(document, ["one"], 1, 0), ["one"]);
    }

    expect(undoUntilStable(store)).toBe(200);
    expect(store.getState().document).not.toBe(start);
    expect(store.getState().document?.elements[0]).toMatchObject({ x: 1 });
  });

  it("commits a slider-style inspector scrub as one entry from its starting snapshot", () => {
    const start = documentWith(rect("one", 10), rect("two", 20));
    const store = createEditorStore(start);

    for (const opacity of [0.8, 0.5, 0.2]) {
      store.getState().replaceDocument((document) => ({
        ...document,
        elements: document.elements.map((element) => ({ ...element, opacity })),
      }));
    }
    store.getState().commitInspectorEdit(
      (document) => ({
        ...document,
        elements: document.elements.map((element) => ({ ...element, opacity: 0.2 })),
      }),
      ["one", "two"],
      start,
    );

    expect(store.getState().document?.elements).toMatchObject([{ opacity: 0.2 }, { opacity: 0.2 }]);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
  });
});
