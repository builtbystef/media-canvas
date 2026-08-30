import type { PreviewUpdate } from "@media-canvas/core";

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

function definitionsOf(svg: Element): Element {
  const standing = svg.querySelector("defs");
  if (standing) return standing;
  const [made] = parseNodes("<defs/>");
  svg.prepend(made!);
  return made!;
}

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
