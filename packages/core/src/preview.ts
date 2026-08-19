// The editor's preview of a Design Document (ADR-0006): the compiler's own
// markup, mounted once and thereafter patched a node at a time. What this
// module decides is *what* has to reach the mounted markup — the whole thing,
// one element's node, or nothing. Putting it there is the editor's business,
// because the answer is the same in any host that can hold an `<svg>`.

import type { AssetResolver } from "./assets.ts";
import type { Caches, CompiledElement, Definition } from "./compile.ts";
import { compileDocument, compileElementOf, newCaches } from "./compile.ts";
import type { DesignDocument, Element } from "./document.ts";

/** One element's node, recompiled, with the definitions that belong to it: the
 *  ones it points at now, and the ids it pointed at before and no longer does.
 *  A patch is applied by replacing the node named `elementId`. */
export type ElementPatch = {
  elementId: string;
  markup: string;
  definitions: Definition[];
  droppedDefinitions: string[];
};

/** What the mounted markup needs in order to show the document it was given.
 *  A full compile is the honest answer to any change the patch path cannot
 *  express — one that adds, removes or reorders nodes, changes the canvas, or
 *  changes the set of Font Assets the inlined faces are keyed on. */
export type PreviewUpdate =
  | { kind: "unchanged" }
  | { kind: "compiled"; svg: string }
  | { kind: "patched"; patches: ElementPatch[] };

export interface Preview {
  /** What has to reach the mounted markup for it to show `document`. */
  update(document: DesignDocument): PreviewUpdate;
}

/**
 * A preview over one document's succession of values.
 *
 * The caches live here, keyed on element object identity, so the document
 * operations that feed it must replace what they change and leave everything
 * else alone (ADR-0006) — that purity is what makes an unchanged element free.
 * The resolver is asked for a Font Asset's bytes once, however many compiles
 * follow.
 */
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

/** Whether the two documents are drawn on the same surface: the same canvas,
 *  at the same schema version. Neither belongs to any one element's node, so a
 *  change to either is a change to everything. */
function sameSurface(before: DesignDocument, after: DesignDocument): boolean {
  return before.canvas === after.canvas && before.schemaVersion === after.schemaVersion;
}

/** The elements that changed, each as the pair of what it was and what it now
 *  is — or nothing at all, when the change is not one that replacing nodes can
 *  express, because the elements were added, removed, reordered or retyped.
 *
 *  A group is descended into only when the group's own node is untouched by
 *  what its children do: a turned group takes its center from its children's
 *  extent, so a child that moves moves the group's own transform with it. */
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

/** Whether a group draws itself the same way whatever its children do. Its
 *  origin, opacity and visibility are its own; its rotation is not, because
 *  the center it turns about is the middle of what its children cover. */
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

/** What replacing one element's node takes — or nothing, when that element
 *  cannot be reached by replacing a node: it drew nothing before or draws
 *  nothing now, so there is no node to put in place of, or it changed which
 *  Font Assets the document draws with, and the inlined faces are a block the
 *  whole document shares. */
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
