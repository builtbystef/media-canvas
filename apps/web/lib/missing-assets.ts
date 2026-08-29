import type { DesignDocument, Element, VariableDecl } from "@media-canvas/core";

/** What the editor does when a document names an asset the library cannot
 *  answer for: name each missing Font Asset or Image Asset, list the Elements
 *  that want it, and rewrite those references in one document operation. */

export type MissingAssetKind = "font" | "image";

export type MissingAsset = {
  id: string;
  kind: MissingAssetKind;
  elementIds: string[];
  elementNames: string[];
};

/** Each missing asset id with the Elements that name it, in document order. */
export function describeMissingAssets(
  document: DesignDocument,
  missingIds: readonly string[],
): MissingAsset[] {
  return missingIds.flatMap((id) => {
    const elementIds: string[] = [];
    const elementNames: string[] = [];
    let kind: MissingAssetKind | null = null;
    const visit = (elements: readonly Element[]) => {
      for (const element of elements) {
        if (element.type === "text" && element.fontAssetId === id) {
          kind = "font";
          elementIds.push(element.id);
          elementNames.push(element.name ?? element.type);
        } else if (element.type === "image" && element.src === id) {
          kind = "image";
          elementIds.push(element.id);
          elementNames.push(element.name ?? element.type);
        } else if (element.type === "group") visit(element.children);
      }
    };
    visit(document.elements);
    if (
      kind === null &&
      (document.variables ?? []).some(
        (variable) => variable.type === "image" && variable.default === id,
      )
    ) {
      kind = "image";
    }
    if (kind === null) return [];
    return [{ id, kind, elementIds, elementNames }];
  });
}

/** Rewrite every Font Asset or Image Asset reference from one id to another.
 *  Only changed Elements and their ancestor groups are replaced. */
export function replaceAssetReferences(
  document: DesignDocument,
  fromId: string,
  toId: string,
): DesignDocument {
  if (fromId === toId) return document;
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next = elements.map((element) => {
      let candidate = element;
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) candidate = { ...element, children };
      } else if (element.type === "image" && element.src === fromId) {
        candidate = { ...element, src: toId };
      } else if (element.type === "text" && element.fontAssetId === fromId) {
        candidate = { ...element, fontAssetId: toId };
      }
      if (candidate !== element) changed = true;
      return candidate;
    });
    return changed ? next : elements;
  };
  const elements = visit(document.elements);
  const variables = rewriteImageDefaults(document.variables, fromId, toId);
  if (elements === document.elements && variables === document.variables) return document;
  return variables === document.variables
    ? { ...document, elements }
    : { ...document, elements, variables };
}

function rewriteImageDefaults(
  variables: VariableDecl[] | undefined,
  fromId: string,
  toId: string,
): VariableDecl[] | undefined {
  if (variables === undefined) return variables;
  let changed = false;
  const next = variables.map((variable) => {
    if (variable.type !== "image" || variable.default !== fromId) return variable;
    changed = true;
    return { ...variable, default: toId };
  });
  return changed ? next : variables;
}
