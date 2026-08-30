import type { DesignDocument, Element, GroupElement } from "@media-canvas/core";

type ElementChange = (element: Element) => Element;

function changeElements(document: DesignDocument, ids: ReadonlySet<string>, change: ElementChange) {
  let documentChanged = false;
  const visit = (elements: Element[]): Element[] => {
    let childrenChanged = false;
    const next = elements.map((element) => {
      let candidate = element;
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) candidate = { ...element, children };
      }
      if (ids.has(element.id)) candidate = change(candidate);
      if (candidate !== element) childrenChanged = true;
      return candidate;
    });
    return childrenChanged ? next : elements;
  };
  const elements = visit(document.elements);
  documentChanged = elements !== document.elements;
  return documentChanged ? { ...document, elements } : document;
}

export function addElement(document: DesignDocument, element: Element): DesignDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function moveElements(
  document: DesignDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
): DesignDocument {
  return changeElements(document, new Set(ids), (element) => ({
    ...element,
    x: element.x + dx,
    y: element.y + dy,
  }));
}

export function renameElement(document: DesignDocument, id: string, name: string): DesignDocument {
  return changeElements(document, new Set([id]), (element) => ({
    ...element,
    name: name.trim() || undefined,
  }));
}

export function setElementVisibility(
  document: DesignDocument,
  id: string,
  visible: boolean,
): DesignDocument {
  return changeElements(document, new Set([id]), (element) => ({ ...element, visible }));
}

export function setTextContent(
  document: DesignDocument,
  id: string,
  content: string,
): DesignDocument {
  return changeElements(document, new Set([id]), (element) =>
    element.type === "text" ? { ...element, content } : element,
  );
}

export function removeElements(document: DesignDocument, ids: readonly string[]): DesignDocument {
  const wanted = new Set(ids);
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next: Element[] = [];
    for (const element of elements) {
      if (wanted.has(element.id)) {
        changed = true;
        continue;
      }
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) {
          next.push({ ...element, children });
          changed = true;
          continue;
        }
      }
      next.push(element);
    }
    return changed ? next : elements;
  };
  const elements = visit(document.elements);
  return elements === document.elements ? document : { ...document, elements };
}

export function reorderElement(
  document: DesignDocument,
  parentPath: readonly string[],
  id: string,
  targetIndex: number,
): DesignDocument {
  const reorder = (elements: Element[]): Element[] => {
    const from = elements.findIndex((element) => element.id === id);
    if (from < 0) return elements;
    const next = [...elements];
    const [element] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, element!);
    return next.every((candidate, index) => candidate === elements[index]) ? elements : next;
  };
  if (parentPath.length === 0) {
    const elements = reorder(document.elements);
    return elements === document.elements ? document : { ...document, elements };
  }
  const [parent, ...rest] = parentPath;
  return changeElements(document, new Set([parent!]), (element) => {
    if (element.type !== "group") return element;
    const children = reorderInGroup(element, rest, reorder);
    return children === element.children ? element : { ...element, children };
  });
}

function reorderInGroup(
  group: GroupElement,
  path: readonly string[],
  reorder: (elements: Element[]) => Element[],
): Element[] {
  if (path.length === 0) return reorder(group.children);
  const [nextId, ...rest] = path;
  let changed = false;
  const children = group.children.map((child) => {
    if (child.id !== nextId || child.type !== "group") return child;
    const nested = reorderInGroup(child, rest, reorder);
    if (nested === child.children) return child;
    changed = true;
    return { ...child, children: nested };
  });
  return changed ? children : group.children;
}
