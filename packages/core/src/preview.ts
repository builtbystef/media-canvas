import type { AssetResolver } from "./assets.ts";
import type { Caches, CompiledElement, Definition } from "./compile.ts";
import { compileDocument, compileElementOf, newCaches } from "./compile.ts";
import type { DesignDocument, Element } from "./document.ts";

export type ElementPatch = {
  elementId: string;
  markup: string;
  definitions: Definition[];
  droppedDefinitions: string[];
};

export type PreviewUpdate =
  | { kind: "unchanged" }
  | { kind: "compiled"; svg: string }
  | { kind: "patched"; patches: ElementPatch[] };

export interface Preview {
  update(document: DesignDocument): PreviewUpdate;
}

export function createPreview(assets: AssetResolver): Preview {
  const caches: Caches = newCaches();
  let shown: DesignDocument | null = null;

  function compileWhole(document: DesignDocument): PreviewUpdate {
    const svg = compileDocument(document, assets, caches);
    shown = document;
    return { kind: "compiled", svg };
  }

  return {
    update(document) {
      if (shown === document) return { kind: "unchanged" };
      const previous = shown;
      if (previous === null || !sameSurface(previous, document)) return compileWhole(document);
      const changed = changedElements(previous.elements, document.elements);
      if (changed === null) return compileWhole(document);
      const patches: ElementPatch[] = [];
      for (const [before, after] of changed) {
        const patch = patchFor(document, before, after, assets, caches);
        if (patch === null) return compileWhole(document);
        patches.push(patch);
      }
      shown = document;
      return patches.length === 0 ? { kind: "unchanged" } : { kind: "patched", patches };
    },
  };
}

function sameSurface(before: DesignDocument, after: DesignDocument): boolean {
  return before.canvas === after.canvas && before.schemaVersion === after.schemaVersion;
}

function changedElements(
  before: readonly Element[],
  after: readonly Element[],
): [Element, Element][] | null {
  if (before.length !== after.length) return null;
  const changed: [Element, Element][] = [];
  for (const [index, was] of before.entries()) {
    const now = after[index]!;
    if (was === now) continue;
    if (was.id !== now.id || was.type !== now.type) return null;
    if (was.type === "group" && now.type === "group" && sameGroupFrame(was, now)) {
      const inside = changedElements(was.children, now.children);
      if (inside !== null) {
        changed.push(...inside);
        continue;
      }
    }
    changed.push([was, now]);
  }
  return changed;
}

function sameGroupFrame(before: Element, after: Element): boolean {
  return (
    before.x === after.x &&
    before.y === after.y &&
    before.opacity === after.opacity &&
    before.visible === after.visible &&
    before.rotation === 0 &&
    after.rotation === 0
  );
}

function patchFor(
  document: DesignDocument,
  before: Element,
  after: Element,
  assets: AssetResolver,
  caches: Caches,
): ElementPatch | null {
  const was = caches.markup.get(before);
  if (!was || was.markup === "") return null;
  const now = compileElementOf(document, after, assets, caches);
  if (now.markup === "" || !sameFonts(was, now)) return null;
  const kept = new Set(now.definitions.map((definition) => definition.id));
  return {
    elementId: after.id,
    markup: now.markup,
    definitions: now.definitions,
    droppedDefinitions: was.definitions
      .map((definition) => definition.id)
      .filter((id) => !kept.has(id)),
  };
}

function sameFonts(before: CompiledElement, after: CompiledElement): boolean {
  return (
    before.fonts.length === after.fonts.length &&
    before.fonts.every((fontAssetId, index) => fontAssetId === after.fonts[index])
  );
}
