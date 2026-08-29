import type { DesignDocument, Element, GroupElement, RectElement } from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  bringForward,
  bringToFront,
  copyElements,
  duplicateElements,
  groupElements,
  idsAtLevel,
  pasteElements,
  sendBackward,
  sendToBack,
  ungroupElements,
} from "./arrangement";
import { moveElements, removeElements } from "./document-operations";
import { createEditorStore } from "./editor-store";
import { DUPLICATE_OFFSET } from "./keyboard-map";

const base = {
  type: "rect" as const,
  y: 0,
  width: 20,
  height: 20,
  rotation: 0,
  opacity: 1,
  visible: true as const,
  fill: "#000000",
};

function rect(id: string, x: number, y = 0): RectElement {
  return { ...base, id, x, y };
}

function documentWith(...elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 200, background: "#FFFFFF" },
    elements,
  };
}

function ids(): () => string {
  let n = 0;
  return () => `new-${String((n += 1))}`;
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

describe("nudge", () => {
  it("records one Undo Entry per key press", () => {
    const start = documentWith(rect("one", 10), rect("two", 40));
    const store = createEditorStore(start);
    store.getState().select(["one"]);

    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 1, 0), ["one"]);
    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 1, 0), ["one"]);
    store
      .getState()
      .commitPlacementEdit((document) => moveElements(document, ["one"], 0, 10), ["one"]);

    expect(store.getState().document?.elements[0]).toMatchObject({ x: 12, y: 10 });
    expect(undoUntilStable(store)).toBe(3);
    expect(store.getState().document).toBe(start);
  });
});

describe("duplicate", () => {
  it("offsets the copy by the settled +10/+10 and leaves the original in place", () => {
    const original = rect("one", 4, 6);
    const other = rect("two", 80);
    const start = documentWith(original, other);

    const duplicated = duplicateElements(start, ["one"], DUPLICATE_OFFSET, ids());

    expect(duplicated.ids).toEqual(["new-1"]);
    expect(duplicated.document.elements).toMatchObject([
      { id: "one", x: 4, y: 6 },
      { id: "two", x: 80 },
      { id: "new-1", x: 14, y: 16 },
    ]);
    expect(duplicated.document.elements[0]).toBe(original);
    expect(duplicated.document.elements[1]).toBe(other);
  });

  it("leaves the original in place when a copy is moved, as Alt-drag does", () => {
    const start = documentWith(rect("one", 4, 6), rect("two", 80));
    const nextId = ids();
    const duplicated = duplicateElements(start, ["one"], { x: 0, y: 0 }, nextId);
    const moved = moveElements(duplicated.document, duplicated.ids, 15, 5);

    expect(moved.elements).toMatchObject([
      { id: "one", x: 4, y: 6 },
      { id: "two", x: 80 },
      { id: "new-1", x: 19, y: 11 },
    ]);
    expect(moved.elements[0]).toBe(start.elements[0]);
  });

  it("records duplicating as one Undo Entry and selects the copies", () => {
    const start = documentWith(rect("one", 0));
    const store = createEditorStore(start);
    const nextId = ids();

    store.getState().commitPlacementEdit(
      (document) => {
        const duplicated = duplicateElements(document, ["one"], DUPLICATE_OFFSET, nextId);
        return duplicated.document;
      },
      ["new-1"],
    );

    expect(store.getState().selected).toEqual(["new-1"]);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
  });
});

describe("clipboard", () => {
  it("pastes a copied pair centred at the pointer, keeping their relative positions", () => {
    const start = documentWith(rect("a", 10, 10), rect("b", 50, 10), rect("other", 0, 80));
    const clipboard = copyElements(start, ["a", "b"]);
    const pasted = pasteElements(start, clipboard, { x: 100, y: 100 }, [], ids());

    expect(pasted.ids).toEqual(["new-1", "new-2"]);
    expect(pasted.document.elements).toMatchObject([
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 50, y: 10 },
      { id: "other", x: 0, y: 80 },
      { id: "new-1", x: 70, y: 90 },
      { id: "new-2", x: 110, y: 90 },
    ]);
    expect(pasted.document.elements[0]).toBe(start.elements[0]);
  });

  it("cuts in one entry by removing the selection after copying it", () => {
    const start = documentWith(rect("a", 10), rect("b", 50), rect("other", 80));
    const store = createEditorStore(start);
    const clipboard = copyElements(start, ["a", "b"]);

    store
      .getState()
      .commitPlacementEdit((document) => removeElements(document, ["a", "b"]), ["a", "b"]);
    store.getState().select([]);

    expect(store.getState().document?.elements).toMatchObject([{ id: "other" }]);
    expect(clipboard.elements).toHaveLength(2);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
    expect(store.getState().selected).toEqual(["a", "b"]);
  });
});

describe("delete", () => {
  it("removes the selection in one Undo Entry", () => {
    const start = documentWith(rect("a", 0), rect("b", 10), rect("c", 20));
    const store = createEditorStore(start);

    store
      .getState()
      .commitPlacementEdit((document) => removeElements(document, ["a", "c"]), ["a", "c"]);
    store.getState().select([]);

    expect(store.getState().document?.elements).toMatchObject([{ id: "b" }]);
    expect(store.getState().selected).toEqual([]);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
    expect(store.getState().selected).toEqual(["a", "c"]);
  });
});

describe("grouping", () => {
  it("wraps the selection in a group, preserving z-order and each member's geometry", () => {
    const a = rect("a", 10, 4);
    const b = rect("b", 40);
    const c = rect("c", 70, 8);
    const start = documentWith(a, b, c);

    const grouped = groupElements(start, ["a", "c"], [], "group-1");

    expect(grouped.id).toBe("group-1");
    expect(grouped.document.elements).toMatchObject([
      { id: "b", x: 40 },
      {
        id: "group-1",
        type: "group",
        x: 0,
        y: 0,
        rotation: 0,
        children: [
          { id: "a", x: 10, y: 4 },
          { id: "c", x: 70, y: 8 },
        ],
      },
    ]);
    expect((grouped.document.elements[1] as GroupElement).children[0]).toBe(a);
    expect((grouped.document.elements[1] as GroupElement).children[1]).toBe(c);
    expect(grouped.document.elements[0]).toBe(b);
  });

  it("ungroups and leaves the children where they visually were, selected", () => {
    const start = documentWith(rect("a", 10, 4), rect("b", 40), rect("c", 70, 8));
    const grouped = groupElements(start, ["a", "c"], [], "group-1");
    const moved = moveElements(grouped.document, ["group-1"], 5, 7);
    const ungrouped = ungroupElements(moved, ["group-1"], []);

    expect(ungrouped.ids).toEqual(["a", "c"]);
    expect(ungrouped.document.elements).toMatchObject([
      { id: "b", x: 40, y: 0 },
      { id: "a", x: 15, y: 11 },
      { id: "c", x: 75, y: 15 },
    ]);
  });

  it("records grouping as one Undo Entry", () => {
    const start = documentWith(rect("a", 10), rect("b", 40));
    const store = createEditorStore(start);

    store.getState().commitPlacementEdit(
      (document) => {
        return groupElements(document, ["a", "b"], [], "group-1").document;
      },
      ["group-1"],
    );

    expect(store.getState().document?.elements).toMatchObject([{ id: "group-1", type: "group" }]);
    expect(undoUntilStable(store)).toBe(1);
    expect(store.getState().document).toBe(start);
  });
});

describe("z-order", () => {
  it("moves the selection forward, backward, to the front, and to the back within its own level", () => {
    const start = documentWith(rect("a", 0), rect("b", 10), rect("c", 20), rect("d", 30));

    expect(bringForward(start, ["a"], []).elements.map((element) => element.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(sendBackward(start, ["c"], []).elements.map((element) => element.id)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(bringToFront(start, ["a", "c"], []).elements.map((element) => element.id)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
    expect(sendToBack(start, ["b", "d"], []).elements.map((element) => element.id)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("does not reorder siblings outside the entered group", () => {
    const inner: GroupElement = {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [rect("a", 0), rect("b", 10), rect("c", 20)],
    };
    const outside = rect("outside", 80);
    const start = documentWith(inner, outside);

    const moved = bringForward(start, ["a"], ["group"]);

    expect((moved.elements[0] as GroupElement).children.map((element) => element.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moved.elements[1]).toBe(outside);
  });
});

describe("select-all", () => {
  it("takes everything at the current level", () => {
    const inner: GroupElement = {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [rect("a", 0), rect("b", 10)],
    };
    const start = documentWith(inner, rect("outside", 80));

    expect(idsAtLevel(start, [])).toEqual(["group", "outside"]);
    expect(idsAtLevel(start, ["group"])).toEqual(["a", "b"]);
  });
});
