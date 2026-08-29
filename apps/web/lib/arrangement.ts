import type { DesignDocument, Element, GroupElement } from "@media-canvas/core";
import { normalizeRotation } from "./placement";

export type Point = { x: number; y: number };
export type Clipboard = { elements: Element[] };

export function duplicateElements(
  document: DesignDocument,
  ids: readonly string[],
  offset: Point,
  nextId: () => string,
  parentPath: readonly string[] = [],
): { document: DesignDocument; ids: string[] } {
  const wanted = new Set(ids);
  const copyIds: string[] = [];
  const rewritten = rewriteSiblings(document, parentPath, (siblings) => {
    const copies: Element[] = [];
    for (const element of siblings) {
      if (!wanted.has(element.id)) continue;
      const copy = offsetElement(cloneTree(element, nextId), offset);
      copies.push(copy);
      copyIds.push(copy.id);
    }
    return copies.length === 0 ? siblings : [...siblings, ...copies];
  });
  return { document: rewritten, ids: copyIds };
}

export function copyElements(document: DesignDocument, ids: readonly string[]): Clipboard {
  const wanted = new Set(ids);
  const elements: Element[] = [];
  const visit = (nodes: readonly Element[]) => {
    for (const element of nodes) {
      if (wanted.has(element.id)) elements.push(snapshot(element));
      else if (element.type === "group") visit(element.children);
    }
  };
  visit(document.elements);
  return { elements };
}

export function pasteElements(
  document: DesignDocument,
  clipboard: Clipboard,
  point: Point,
  parentPath: readonly string[],
  nextId: () => string,
): { document: DesignDocument; ids: string[] } {
  if (clipboard.elements.length === 0) return { document, ids: [] };
  const boxes = clipboard.elements.map(authoredBox);
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const offset = { x: point.x - (left + right) / 2, y: point.y - (top + bottom) / 2 };
  const ids: string[] = [];
  const pasted = clipboard.elements.map((element) => {
    const copy = offsetElement(cloneTree(element, nextId), offset);
    ids.push(copy.id);
    return copy;
  });
  return {
    document: rewriteSiblings(document, parentPath, (siblings) => [...siblings, ...pasted]),
    ids,
  };
}

export function groupElements(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
  groupId: string,
): { document: DesignDocument; id: string } {
  const wanted = new Set(ids);
  const rewritten = rewriteSiblings(document, parentPath, (siblings) => {
    const children: Element[] = [];
    const kept: Element[] = [];
    let insertAt = 0;
    for (const element of siblings) {
      if (wanted.has(element.id)) {
        children.push(element);
        insertAt = kept.length;
      } else kept.push(element);
    }
    if (children.length === 0) return siblings;
    const group: GroupElement = {
      id: groupId,
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children,
    };
    kept.splice(insertAt, 0, group);
    return kept;
  });
  return { document: rewritten, id: groupId };
}

export function ungroupElements(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
): { document: DesignDocument; ids: string[] } {
  const wanted = new Set(ids);
  const selected: string[] = [];
  const rewritten = rewriteSiblings(document, parentPath, (siblings) => {
    const next: Element[] = [];
    let changed = false;
    for (const element of siblings) {
      if (wanted.has(element.id) && element.type === "group") {
        const baked = element.children.map((child) => bakeOut(child, element));
        next.push(...baked);
        selected.push(...baked.map((child) => child.id));
        changed = true;
      } else {
        next.push(element);
        if (wanted.has(element.id)) selected.push(element.id);
      }
    }
    return changed ? next : siblings;
  });
  return { document: rewritten, ids: selected };
}

export function bringForward(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
): DesignDocument {
  return reorderSelected(document, ids, parentPath, (siblings, selected) => {
    const next = [...siblings];
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index]!.id) && !selected.has(next[index + 1]!.id)) {
        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      }
    }
    return next;
  });
}

export function sendBackward(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
): DesignDocument {
  return reorderSelected(document, ids, parentPath, (siblings, selected) => {
    const next = [...siblings];
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index]!.id) && !selected.has(next[index - 1]!.id)) {
        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      }
    }
    return next;
  });
}

export function bringToFront(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
): DesignDocument {
  return reorderSelected(document, ids, parentPath, (siblings, selected) => {
    const kept = siblings.filter((element) => !selected.has(element.id));
    const moving = siblings.filter((element) => selected.has(element.id));
    return moving.length === 0 ? siblings : [...kept, ...moving];
  });
}

export function sendToBack(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
): DesignDocument {
  return reorderSelected(document, ids, parentPath, (siblings, selected) => {
    const kept = siblings.filter((element) => !selected.has(element.id));
    const moving = siblings.filter((element) => selected.has(element.id));
    return moving.length === 0 ? siblings : [...moving, ...kept];
  });
}

export function idsAtLevel(document: DesignDocument, parentPath: readonly string[]): string[] {
  return siblingsAt(document.elements, parentPath).map((element) => element.id);
}

function reorderSelected(
  document: DesignDocument,
  ids: readonly string[],
  parentPath: readonly string[],
  reorder: (siblings: Element[], selected: ReadonlySet<string>) => Element[],
): DesignDocument {
  const selected = new Set(ids);
  return rewriteSiblings(document, parentPath, (siblings) => {
    const next = reorder(siblings, selected);
    return next.length === siblings.length &&
      next.every((element, index) => element === siblings[index])
      ? siblings
      : next;
  });
}

function rewriteSiblings(
  document: DesignDocument,
  parentPath: readonly string[],
  rewrite: (siblings: Element[]) => Element[],
): DesignDocument {
  const apply = (elements: Element[], path: readonly string[]): Element[] => {
    if (path.length === 0) {
      const next = rewrite(elements);
      return next === elements ? elements : next;
    }
    const [head, ...rest] = path;
    let changed = false;
    const next = elements.map((element) => {
      if (element.id !== head || element.type !== "group") return element;
      const children = apply(element.children, rest);
      if (children === element.children) return element;
      changed = true;
      return { ...element, children };
    });
    return changed ? next : elements;
  };
  const elements = apply(document.elements, parentPath);
  return elements === document.elements ? document : { ...document, elements };
}

function siblingsAt(elements: readonly Element[], path: readonly string[]): readonly Element[] {
  let siblings = elements;
  for (const id of path) {
    const group = siblings.find((element) => element.id === id);
    if (group?.type !== "group") return [];
    siblings = group.children;
  }
  return siblings;
}

function cloneTree(element: Element, nextId: () => string): Element {
  const id = nextId();
  return element.type === "group"
    ? { ...element, id, children: element.children.map((child) => cloneTree(child, nextId)) }
    : { ...element, id };
}

function snapshot(element: Element): Element {
  return element.type === "group"
    ? { ...element, children: element.children.map(snapshot) }
    : { ...element };
}

function offsetElement(element: Element, offset: Point): Element {
  return offset.x === 0 && offset.y === 0
    ? element
    : { ...element, x: element.x + offset.x, y: element.y + offset.y };
}

function bakeOut(child: Element, group: GroupElement): Element {
  if (group.rotation === 0) {
    return group.x === 0 && group.y === 0
      ? child
      : { ...child, x: child.x + group.x, y: child.y + group.y };
  }
  const bounds = authoredBox({ ...group, x: 0, y: 0 });
  const pivot = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const box = authoredBox(child);
  const rotated = rotatePoint(
    { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
    pivot,
    group.rotation,
  );
  return {
    ...child,
    x: rotated.x - (box.right - box.left) / 2 + group.x,
    y: rotated.y - (box.bottom - box.top) / 2 + group.y,
    rotation: normalizeRotation(child.rotation + group.rotation),
  };
}

function authoredBox(element: Element): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  if (element.type === "group") {
    if (element.children.length === 0) {
      return { left: element.x, top: element.y, right: element.x, bottom: element.y };
    }
    const boxes = element.children.map(authoredBox);
    return {
      left: element.x + Math.min(...boxes.map((box) => box.left)),
      top: element.y + Math.min(...boxes.map((box) => box.top)),
      right: element.x + Math.max(...boxes.map((box) => box.right)),
      bottom: element.y + Math.max(...boxes.map((box) => box.bottom)),
    };
  }
  const width = "width" in element ? element.width : 0;
  const height = "height" in element ? element.height : 0;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height };
}

function rotatePoint(point: Point, pivot: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {
    x: pivot.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: pivot.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}
