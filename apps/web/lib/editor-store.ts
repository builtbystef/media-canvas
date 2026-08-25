import type { DesignDocument, Element } from "@media-canvas/core";
import { createStore } from "zustand/vanilla";
import { addElement, removeElements, setTextContent } from "./document-operations";
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
  beginTextEdit: (id: string) => void;
  updateTextContent: (content: string) => void;
  endTextEdit: () => void;
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

    const finishTextEdit = (state: EditorState): Partial<EditorState> => {
      const id = state.editingTextId;
      if (id === null || state.document === null) return { editingTextId: null };
      const content = textContentOf(state.document, id);
      const next =
        content === null || content === "" ? removeElements(state.document, [id]) : state.document;
      return { ...commit(state, next, [id]), editingTextId: null };
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
      armTool: (activeTool) => set((state) => ({ ...finishTextEdit(state), activeTool })),
      createElement: (element) =>
        set((state) => {
          if (state.document === null) return state;
          const next = {
            ...commit(state, addElement(state.document, element), [element.id]),
            enteredPath: [],
            activeTool: "select" as const,
            editingTextId: element.type === "text" ? element.id : null,
          };
          return next;
        }),
      beginTextEdit: (id) =>
        set((state) => {
          if (state.document === null) return state;
          const ended =
            state.editingTextId !== null && state.editingTextId !== id ? finishTextEdit(state) : {};
          const document = ended.document ?? state.document;
          if (document === null) return { ...ended, editingTextId: null };
          return { ...ended, document, editingTextId: id, selected: [id] };
        }),
      updateTextContent: (content) =>
        set((state) => {
          if (state.document === null || state.editingTextId === null) return state;
          return {
            document: setTextContent(state.document, state.editingTextId, content),
          };
        }),
      endTextEdit: () => set((state) => finishTextEdit(state)),
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
          return {
            document: restored.document,
            selected: leaving.touched,
            editingTextId: null,
          };
        }),
      redo: () =>
        set((state) => {
          if (cursor >= history.length - 1 || state.document === null) return state;
          cursor += 1;
          const restored = history[cursor];
          if (restored === undefined) return state;
          return { document: restored.document, selected: restored.touched, editingTextId: null };
        }),
    };
  });
}

function textContentOf(document: DesignDocument, id: string): string | null {
  const visit = (elements: readonly Element[]): string | null => {
    for (const element of elements) {
      if (element.id === id) return element.type === "text" ? element.content : null;
      if (element.type === "group") {
        const found = visit(element.children);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return visit(document.elements);
}
