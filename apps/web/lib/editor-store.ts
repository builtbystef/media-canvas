import type { DesignDocument } from "@media-canvas/core";
import { createStore } from "zustand/vanilla";

export type EditorState = {
  document: DesignDocument | null;
  selected: string[];
  enteredPath: string[];
  replaceDocument: (change: (document: DesignDocument) => DesignDocument) => void;
  select: (selected: string[], enteredPath?: string[]) => void;
};

/** One store owns editor document and selection state. The next undo slice can
 * add snapshot history here without moving either authority. */
export function createEditorStore(document: DesignDocument | null) {
  return createStore<EditorState>((set) => ({
    document,
    selected: [],
    enteredPath: [],
    replaceDocument: (change) =>
      set((state) => ({ document: state.document === null ? null : change(state.document) })),
    select: (selected, enteredPath) =>
      set((state) => ({
        selected,
        enteredPath: enteredPath ?? state.enteredPath,
      })),
  }));
}
