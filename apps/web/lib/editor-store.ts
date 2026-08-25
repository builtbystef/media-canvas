import type { DesignDocument, Element } from "@media-canvas/core";
import { createStore } from "zustand/vanilla";
import { addElement } from "./document-operations";
import type { Tool } from "./drawing-tools";
import { applyHandleDrag, type Handle, type HandleDragOptions, type Point } from "./resize-scale";

/** How many completed gestures the in-memory stack keeps (node 73rm0x). */
export const UNDO_LIMIT = 200;

type Snapshot = {
  document: DesignDocument;
  touched: string[];
};

export type EditorState = {
  document: DesignDocument | null;
  selected: string[];
  enteredPath: string[];
  activeTool: Tool;
  editingTextId: string | null;
  replaceDocument: (change: (document: DesignDocument) => DesignDocument) => void;
  select: (selected: string[], enteredPath?: string[]) => void;
  armTool: (tool: Tool) => void;
  createElement: (element: Element) => void;
  commitInspectorEdit: (
    change: (document: DesignDocument) => DesignDocument,
    ids: readonly string[],
    gestureStart?: DesignDocument,
  ) => void;
  commitHandleDrag: (
    ids: readonly string[],
    handle: Handle,
    delta: Point,
    options?: HandleDragOptions,
    gestureStart?: DesignDocument,
  ) => void;
  commitPlacementEdit: (
    change: (document: DesignDocument) => DesignDocument,
    ids: readonly string[],
    gestureStart?: DesignDocument,
  ) => void;
  undo: () => void;
  redo: () => void;
};

export type EditorStore = ReturnType<typeof createEditorStore>;

/** One store owns editor document, selection, and the in-memory undo pointer. */
export function createEditorStore(document: DesignDocument | null) {
  const history: Snapshot[] = document === null ? [] : [{ document, touched: [] }];
  let cursor = 0;

  return createStore<EditorState>((set) => {
    const commit = (
      state: EditorState,
      next: DesignDocument | null,
      touched: readonly string[],
    ): Partial<EditorState> => {
      if (next === null || state.document === null)
        return { document: next, selected: [...touched] };
      const committed = history[cursor]?.document;
      if (next === committed) return { document: next, selected: [...touched] };
      const kept = history.slice(0, cursor + 1);
      kept.push({ document: next, touched: [...touched] });
      if (kept.length > UNDO_LIMIT + 1) kept.shift();
      history.length = 0;
      history.push(...kept);
      cursor = history.length - 1;
      return { document: next, selected: [...touched] };
    };

    return {
      document,
      selected: [],
      enteredPath: [],
      activeTool: "select",
      editingTextId: null,
      replaceDocument: (change) =>
        set((state) => ({ document: state.document === null ? null : change(state.document) })),
      select: (selected, enteredPath) =>
        set((state) => ({
          selected,
          enteredPath: enteredPath ?? state.enteredPath,
        })),
      armTool: (activeTool) => set({ activeTool, editingTextId: null }),
      createElement: (element) =>
        set((state) => {
          if (state.document === null) return state;
          return {
            ...commit(state, addElement(state.document, element), [element.id]),
            enteredPath: [],
            activeTool: "select",
            editingTextId: element.type === "text" ? element.id : null,
          };
        }),
      // A typed commit calls this once; a scrub may preview through
      // `replaceDocument`, then calls this once on release with its starting
      // snapshot. That boundary is one Undo Entry.
      commitInspectorEdit: (change, ids, gestureStart) =>
        set((state) => {
          if (state.document === null) return state;
          return commit(state, change(gestureStart ?? state.document), ids);
        }),
      commitHandleDrag: (ids, handle, delta, options, gestureStart) =>
        set((state) => {
          if (state.document === null) return state;
          return commit(
            state,
            applyHandleDrag(gestureStart ?? state.document, ids, handle, delta, options),
            ids,
          );
        }),
      // Rotation, alignment, and distribution each cross this boundary once.
      commitPlacementEdit: (change, ids, gestureStart) =>
        set((state) => {
          if (state.document === null) return state;
          return commit(state, change(gestureStart ?? state.document), ids);
        }),
      undo: () =>
        set((state) => {
          if (cursor === 0 || state.document === null) return state;
          const leaving = history[cursor];
          cursor -= 1;
          const restored = history[cursor];
          if (leaving === undefined || restored === undefined) return state;
          return { document: restored.document, selected: leaving.touched };
        }),
      redo: () =>
        set((state) => {
          if (cursor >= history.length - 1 || state.document === null) return state;
          cursor += 1;
          const restored = history[cursor];
          if (restored === undefined) return state;
          return { document: restored.document, selected: restored.touched };
        }),
    };
  });
}
