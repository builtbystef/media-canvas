import type { PreviewUpdate } from "@media-canvas/core";

/**
 * Putting the core's answer into the DOM.
 *
 * The container this writes into is one React never reconciles (ADR-0006):
 * every change reaches it here, imperatively, so that a per-gesture patch and
 * a re-render can never fight over the same nodes. What to change is the
 * core's decision — this only carries it out.
 *
 * Markup is parsed as XML rather than assigned as `innerHTML`, so that every
 * node lands in the SVG namespace whatever it is nested in.
 */
export function applyUpdate(host: Element, update: PreviewUpdate): void {
  if (update.kind === "unchanged") return;
  if (update.kind === "compiled") {
    const [svg] = parseNodes(update.svg);
    if (svg) host.replaceChildren(svg);
    return;
  }
  const svg = host.firstElementChild;
  if (!svg) return;
  for (const patch of update.patches) {
    const node = svg.querySelector(`[data-element="${CSS.escape(patch.elementId)}"]`);
    // The compiler emits one node per element and names it, so a patch that
    // finds nothing means the mounted markup is not what it was compiled from.
    if (!node) continue;
    node.replaceWith(...parseNodes(patch.markup));
    if (patch.definitions.length === 0 && patch.droppedDefinitions.length === 0) continue;
    const defs = definitionsOf(svg);
    for (const id of patch.droppedDefinitions) defs.querySelector(`#${CSS.escape(id)}`)?.remove();
    for (const definition of patch.definitions) {
      const [replacement] = parseNodes(definition.markup);
      if (!replacement) continue;
      const standing = defs.querySelector(`#${CSS.escape(definition.id)}`);
      if (standing) standing.replaceWith(replacement);
      else defs.append(replacement);
    }
  }
}

/** The `<defs>` block, made if the document had nothing to define until now.
 *  The block of font faces is the first thing in it and is never touched by a
 *  patch — it is keyed on the set of Font Assets, which no patch changes. */
function definitionsOf(svg: Element): Element {
  const standing = svg.querySelector("defs");
  if (standing) return standing;
  const [made] = parseNodes("<defs/>");
  svg.prepend(made!);
  return made!;
}

/** Compiled markup as nodes of this document, in the SVG namespace. */
function parseNodes(markup: string): Element[] {
  const parsed = new DOMParser().parseFromString(
    markup.startsWith("<svg") ? markup : `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml",
  );
  const root = parsed.documentElement;
  if (root.nodeName === "parsererror" || root.getElementsByTagName("parsererror").length > 0) {
    throw new Error("the compiled markup could not be parsed");
  }
  const nodes = markup.startsWith("<svg") ? [root] : [...root.children];
  return nodes.map((node) => document.importNode(node, true));
}
