import type { DesignDocument, Element } from "@media-canvas/core";
import { resolve } from "@media-canvas/core";

export function previewDocument(
  document: DesignDocument,
  editingTextId?: string | null,
): DesignDocument {
  if (document.variables === undefined && !hasBindings(document)) return document;
  const resolved = resolve(document, {}, "preview");
  const previewed = {
    ...resolved,
    canvas:
      JSON.stringify(resolved.canvas) === JSON.stringify(document.canvas)
        ? document.canvas
        : resolved.canvas,
    elements: shareElements(document.elements, resolved.elements),
  };
  return editingTextId ? restoreContent(previewed, document, editingTextId) : previewed;
}

function restoreContent(
  previewed: DesignDocument,
  source: DesignDocument,
  id: string,
): DesignDocument {
  const original = findText(source.elements, id);
  if (original === null) return previewed;
  return {
    ...previewed,
    elements: setTextContent(previewed.elements, id, original.content),
  };
}

function findText(
  elements: readonly Element[],
  id: string,
): Extract<Element, { type: "text" }> | null {
  for (const element of elements) {
    if (element.id === id) return element.type === "text" ? element : null;
    if (element.type === "group") {
      const found = findText(element.children, id);
      if (found !== null) return found;
    }
  }
  return null;
}

function setTextContent(elements: Element[], id: string, content: string): Element[] {
  let changed = false;
  const next = elements.map((element) => {
    if (element.id === id && element.type === "text" && element.content !== content) {
      changed = true;
      return { ...element, content };
    }
    if (element.type === "group") {
      const children = setTextContent(element.children, id, content);
      if (children !== element.children) {
        changed = true;
        return { ...element, children };
      }
    }
    return element;
  });
  return changed ? next : elements;
}

function shareElements(original: readonly Element[], resolved: readonly Element[]): Element[] {
  let changed = false;
  const next = original.map((element, index) => {
    const previewed = resolved[index];
    if (previewed === undefined) {
      changed = true;
      return element;
    }
    const shared = shareElement(element, previewed);
    if (shared !== element) changed = true;
    return shared;
  });
  return changed ? next : (original as Element[]);
}

function shareElement(original: Element, resolved: Element): Element {
  if (original.type === "group" && resolved.type === "group") {
    const children = shareElements(original.children, resolved.children);
    const candidate = children === original.children ? original : { ...resolved, children };
    return JSON.stringify(withoutChildren(candidate)) === JSON.stringify(withoutChildren(original))
      ? children === original.children
        ? original
        : { ...original, children }
      : { ...resolved, children };
  }
  return JSON.stringify(original) === JSON.stringify(resolved) ? original : resolved;
}

function withoutChildren(element: Extract<Element, { type: "group" }>) {
  const { children: _children, ...rest } = element;
  return rest;
}

function hasBindings(document: DesignDocument): boolean {
  if (typeof document.canvas.background === "object" && "$var" in document.canvas.background) {
    return true;
  }
  const visit = (elements: readonly Element[]): boolean =>
    elements.some((element) => {
      if (isBound(element.visible)) return true;
      if (element.type === "group") return visit(element.children);
      if ("fill" in element && isBound(element.fill)) return true;
      if ("border" in element && element.border && isBound(element.border.color)) return true;
      if (element.type === "image" && isBound(element.src)) return true;
      if (element.type === "text" && (isBound(element.color) || element.content.includes("{{"))) {
        return true;
      }
      return false;
    });
  return visit(document.elements);
}

function isBound(value: unknown): boolean {
  return typeof value === "object" && value !== null && "$var" in value;
}
