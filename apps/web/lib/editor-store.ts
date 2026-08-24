import type { DesignDocument, Element } from "@media-canvas/core";
import { createStore } from "zustand/vanilla";
import { addElement } from "./document-operations";
import type { Tool } from "./drawing-tools";
import { applyHandleDrag, type Handle, type HandleDragOptions, type Point } from "./resize-scale";

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
  commitHandleDrag: (
    ids: readonly string[],
    handle: Handle,
    delta: Point,
    options?: HandleDragOptions,
    gestureStart?: DesignDocument,
  ) => void;
};

/** One store owns editor document and selection state. The next undo slice can
 * add snapshot history here without moving either authority. */
export function createEditorStore(document: DesignDocument | null) {
  return createStore<EditorState>((set) => ({
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
      set((state) => ({
        document: state.document === null ? null : addElement(state.document, element),
        selected: [element.id],
        enteredPath: [],
        activeTool: "select",
        editingTextId: element.type === "text" ? element.id : null,
      })),
    commitHandleDrag: (ids, handle, delta, options, gestureStart) =>
      set((state) => ({
        document:
          state.document === null
            ? null
            : applyHandleDrag(gestureStart ?? state.document, ids, handle, delta, options),
        selected: [...ids],
      })),
  }));
}
