import type { Tool } from "./drawing-tools";

/** Document-space px. Bound from node ep90f3. */
export const NUDGE_DISTANCE = 1;
export const NUDGE_DISTANCE_SHIFTED = 10;
export const DUPLICATE_OFFSET = { x: 10, y: 10 };

export type KeyInput = {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type KeyCommand =
  | { type: "nudge"; dx: number; dy: number }
  | { type: "duplicate" }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "delete" }
  | { type: "group" }
  | { type: "ungroup" }
  | { type: "bring-forward" }
  | { type: "send-backward" }
  | { type: "bring-to-front" }
  | { type: "send-to-back" }
  | { type: "select-all" }
  | { type: "escape" };

export type EscapeState = {
  activeTool: Tool;
  editingTextId: string | null;
  enteredPath: string[];
  selected: string[];
};

export function commandFromKey(event: KeyInput): KeyCommand | null {
  if (event.key === "Escape") return { type: "escape" };
  const cmd = event.metaKey === true || event.ctrlKey === true;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (cmd && key === "d") return { type: "duplicate" };
  if (cmd && key === "c") return { type: "copy" };
  if (cmd && key === "x") return { type: "cut" };
  if (cmd && key === "v") return { type: "paste" };
  if (cmd && key === "a") return { type: "select-all" };
  if (cmd && key === "g") return event.shiftKey ? { type: "ungroup" } : { type: "group" };
  if (cmd && (key === "]" || event.code === "BracketRight")) {
    return event.altKey ? { type: "bring-to-front" } : { type: "bring-forward" };
  }
  if (cmd && (key === "[" || event.code === "BracketLeft")) {
    return event.altKey ? { type: "send-to-back" } : { type: "send-backward" };
  }
  if (key === "Delete" || key === "Backspace") return { type: "delete" };
  if (cmd) return null;
  const step = event.shiftKey ? NUDGE_DISTANCE_SHIFTED : NUDGE_DISTANCE;
  if (key === "ArrowLeft") return { type: "nudge", dx: -step, dy: 0 };
  if (key === "ArrowRight") return { type: "nudge", dx: step, dy: 0 };
  if (key === "ArrowUp") return { type: "nudge", dx: 0, dy: -step };
  if (key === "ArrowDown") return { type: "nudge", dx: 0, dy: step };
  return null;
}

/** One Escape press peels one layer of editor state, in the order node
 * ep90f3 settled: cancel the tool, leave text editing, leave the entered
 * group, then deselect. */
export function unwindEscape(state: EscapeState): EscapeState {
  if (state.activeTool !== "select") return { ...state, activeTool: "select" };
  if (state.editingTextId !== null) return { ...state, editingTextId: null };
  if (state.enteredPath.length > 0) {
    const exited = state.enteredPath.at(-1)!;
    return { ...state, enteredPath: state.enteredPath.slice(0, -1), selected: [exited] };
  }
  if (state.selected.length > 0) return { ...state, selected: [] };
  return state;
}
