import { caretRect, hitIndex, type TextLayout } from "@media-canvas/core";

export type TextSelection = { anchor: number; focus: number };

export type TextEditPointer =
  | { action: "none" }
  | { action: "end" }
  | { action: "begin" }
  | { action: "drag-select"; index: number; extend: boolean };

export function successiveClickCount(
  previous: { id: string; at: number; count: number } | null,
  id: string,
  at: number,
  windowMs = 500,
): { id: string; at: number; count: number } {
  if (previous !== null && previous.id === id && at - previous.at < windowMs) {
    return { id, at, count: previous.count + 1 };
  }
  return { id, at, count: 1 };
}

export function interpretTextPointerDown(input: {
  editingId: string | null;
  targetId: string | null;
  isText: boolean;
  detail: number;
  shiftKey: boolean;
  index: number;
}): TextEditPointer {
  if (input.editingId !== null) {
    if (input.targetId === input.editingId) {
      if (input.detail >= 2) return { action: "begin" };
      return { action: "drag-select", index: input.index, extend: input.shiftKey };
    }
    return { action: "end" };
  }
  if (input.isText && input.detail >= 2) return { action: "begin" };
  return { action: "none" };
}

export function insertText(
  content: string,
  selection: TextSelection,
  text: string,
): { content: string; selection: TextSelection } {
  const start = Math.min(selection.anchor, selection.focus);
  const end = Math.max(selection.anchor, selection.focus);
  const next = start + text.length;
  return {
    content: content.slice(0, start) + text + content.slice(end),
    selection: { anchor: next, focus: next },
  };
}

export function moveByCharacter(
  content: string,
  selection: TextSelection,
  direction: -1 | 1,
  extend: boolean,
): TextSelection {
  if (!extend && selection.anchor !== selection.focus) {
    const edge =
      direction < 0
        ? Math.min(selection.anchor, selection.focus)
        : Math.max(selection.anchor, selection.focus);
    return { anchor: edge, focus: edge };
  }
  return place(selection, clamp(content.length, selection.focus + direction), extend);
}

export function moveByWord(
  content: string,
  selection: TextSelection,
  direction: -1 | 1,
  extend: boolean,
): TextSelection {
  const next =
    direction < 0 ? previousWord(content, selection.focus) : nextWord(content, selection.focus);
  return place(selection, next, extend);
}

export function moveByLine(
  layout: TextLayout,
  selection: TextSelection,
  direction: -1 | 1,
  extend: boolean,
): TextSelection {
  const lineIndex = lineIndexAt(layout, selection.focus);
  const target = layout.lines[lineIndex + direction];
  if (target === undefined) {
    const edge = direction < 0 ? 0 : (layout.lines.at(-1)?.end ?? 0);
    return place(selection, edge, extend);
  }
  const caret = caretRect(layout, selection.focus);
  return place(selection, hitIndex(layout, { x: caret.x, y: target.baselineY }), extend);
}

export function moveToLineBoundary(
  layout: TextLayout,
  selection: TextSelection,
  which: "start" | "end",
  extend: boolean,
): TextSelection {
  const line = layout.lines[lineIndexAt(layout, selection.focus)];
  if (line === undefined) return selection;
  return place(selection, which === "start" ? line.start : line.end, extend);
}

export function selectionRects(
  layout: TextLayout,
  start: number,
  end: number,
): { x: number; y: number; width: number; height: number }[] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (from === to) return [];
  return layout.lines.flatMap((line, lineIndex) => {
    if (to <= line.start || from >= line.end) return [];
    const left = caretRect(layout, Math.max(from, line.start));
    const right = caretRect(layout, Math.min(to, line.end));
    return [
      {
        x: left.x,
        y: layout.top + lineIndex * layout.lineBoxHeight,
        width: Math.max(0, right.x - left.x),
        height: layout.lineBoxHeight,
      },
    ];
  });
}

export function selectWord(content: string, index: number): TextSelection {
  const at = clamp(content.length, index);
  if (content.length === 0) return { anchor: 0, focus: 0 };
  const probe = at < content.length ? at : at - 1;
  const word = isWord(content[probe]!);
  let start = probe;
  let end = probe + 1;
  while (start > 0 && isWord(content[start - 1]!) === word) start -= 1;
  while (end < content.length && isWord(content[end]!) === word) end += 1;
  return { anchor: start, focus: end };
}

function place(selection: TextSelection, focus: number, extend: boolean): TextSelection {
  return extend ? { ...selection, focus } : { anchor: focus, focus };
}

function clamp(length: number, index: number): number {
  return Math.max(0, Math.min(length, index));
}

function isWord(character: string): boolean {
  return /[A-Za-z0-9_]/.test(character);
}

function nextWord(content: string, index: number): number {
  let at = index;
  while (at < content.length && !isWord(content[at]!)) at += 1;
  while (at < content.length && isWord(content[at]!)) at += 1;
  return at;
}

function previousWord(content: string, index: number): number {
  let at = index;
  while (at > 0 && !isWord(content[at - 1]!)) at -= 1;
  while (at > 0 && isWord(content[at - 1]!)) at -= 1;
  return at;
}

function lineIndexAt(layout: TextLayout, index: number): number {
  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
    const next = layout.lines[lineIndex + 1];
    if (next === undefined || index < next.start) return lineIndex;
  }
  return Math.max(0, layout.lines.length - 1);
}
