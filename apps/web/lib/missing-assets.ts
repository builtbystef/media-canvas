import type { DesignDocument, Element, VariableDecl } from "@media-canvas/core";

export type MissingAssetKind = "font" | "image";

export type MissingAsset = {
  id: string;
  kind: MissingAssetKind;
  elementIds: string[];
  elementNames: string[];
};

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
