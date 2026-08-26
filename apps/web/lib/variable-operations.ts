import type {
  Border,
  DesignDocument,
  Element,
  Fill,
  VarRef,
  VariableDecl,
  VariableType,
} from "@media-canvas/core";
import { interpolationTokens } from "@media-canvas/core";

/** The name grammar 8h50hu pinned: one token, no escaping, case-sensitive. */
const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export type VariableChange =
  | { ok: true; document: DesignDocument }
  | { ok: false; reason: "invalid_name" | "collision" };

export function isVariableName(name: string): boolean {
  return VARIABLE_NAME.test(name);
}

export function createVariable(
  document: DesignDocument,
  declaration: VariableDecl,
): VariableChange {
  if (!isVariableName(declaration.name)) return { ok: false, reason: "invalid_name" };
  if ((document.variables ?? []).some((existing) => existing.name === declaration.name)) {
    return { ok: false, reason: "collision" };
  }
  return {
    ok: true,
    document: { ...document, variables: [...(document.variables ?? []), declaration] },
  };
}

export function renameVariable(document: DesignDocument, from: string, to: string): VariableChange {
  if (from === to) return { ok: true, document };
  if (!isVariableName(to)) return { ok: false, reason: "invalid_name" };
  if ((document.variables ?? []).some((existing) => existing.name === to)) {
    return { ok: false, reason: "collision" };
  }
  const variables = (document.variables ?? []).map((declaration) =>
    declaration.name === from ? { ...declaration, name: to } : declaration,
  );
  const rewritten = rewriteBindings(document, {
    bind: (ref) => (ref.$var === from ? { $var: to } : ref),
    content: (text) => text.replaceAll(`{{${from}}}`, `{{${to}}}`),
  });
  return {
    ok: true,
    document: {
      ...rewritten,
      variables,
    },
  };
}

export function deleteVariable(document: DesignDocument, name: string): DesignDocument {
  const declaration = (document.variables ?? []).find((variable) => variable.name === name);
  if (declaration === undefined) return document;
  const rewritten = rewriteBindings(document, {
    bind: (ref) => (ref.$var === name ? writtenBack(declaration, ref) : ref),
    content: (text) => text,
  });
  const variables = (rewritten.variables ?? []).filter((variable) => variable.name !== name);
  return { ...rewritten, variables };
}

export type VariableUsage = { properties: number; textElements: number };

export function variableUsage(document: DesignDocument, name: string): VariableUsage {
  let properties = 0;
  let textElements = 0;
  visitBindings(document, {
    bind: (ref) => {
      if (ref.$var === name) properties += 1;
    },
    content: (text) => {
      if (text.includes(`{{${name}}}`)) textElements += 1;
    },
  });
  return { properties, textElements };
}

/** The elements a Variable rename or delete touches — undo selects these. */
export function elementsUsingVariable(document: DesignDocument, name: string): string[] {
  const ids: string[] = [];
  const token = `{{${name}}}`;
  const uses = (value: unknown) => isVarRef(value) && value.$var === name;
  const visit = (elements: readonly Element[]) => {
    for (const element of elements) {
      let used = uses(element.visible);
      if (element.type === "group") {
        if (used) ids.push(element.id);
        visit(element.children);
        continue;
      }
      if ("fill" in element) used = used || uses(element.fill);
      if ("border" in element && element.border) used = used || uses(element.border.color);
      if (element.type === "image") used = used || uses(element.src);
      if (element.type === "text") {
        used = used || uses(element.color) || element.content.includes(token);
      }
      if (used) ids.push(element.id);
    }
  };
  visit(document.elements);
  return ids;
}

export function describeVariableUsage(usage: VariableUsage): string {
  if (usage.properties === 0 && usage.textElements === 0) {
    return "Nothing references this Variable.";
  }
  const parts: string[] = [];
  if (usage.properties > 0) {
    parts.push(
      `bound to ${String(usage.properties)} ${usage.properties === 1 ? "property" : "properties"}`,
    );
  }
  if (usage.textElements > 0) {
    parts.push(
      `used in ${String(usage.textElements)} text ${usage.textElements === 1 ? "element" : "elements"}`,
    );
  }
  return `${parts.join(", ")}.`;
}

export function setVariableDefault(
  document: DesignDocument,
  name: string,
  value: string | number | boolean | undefined,
): DesignDocument {
  return updateDeclaration(document, name, (declaration) => {
    if (declaration.default === value) return declaration;
    const { default: _previous, ...rest } = declaration;
    return value === undefined ? rest : { ...rest, default: value };
  });
}

export function setVariableConstraints(
  document: DesignDocument,
  name: string,
  constraints: { minLength?: number; maxLength?: number } | undefined,
): DesignDocument {
  return updateDeclaration(document, name, (declaration) => {
    const next =
      constraints === undefined ||
      (constraints.minLength === undefined && constraints.maxLength === undefined)
        ? undefined
        : constraints;
    if (JSON.stringify(declaration.constraints) === JSON.stringify(next)) return declaration;
    const { constraints: _previous, ...rest } = declaration;
    return next === undefined ? rest : { ...rest, constraints: next };
  });
}

/** A bindable inspector site. Text and numbers bind as tokens, not here. */
export type BindSite =
  | { site: "fill" | "borderColor" | "textColor" | "imageSrc" | "visible"; elementId: string }
  | { site: "background" };

export function matchingVariables(document: DesignDocument, type: VariableType): VariableDecl[] {
  return (document.variables ?? []).filter((variable) => variable.type === type);
}

export function siteType(site: BindSite["site"]): VariableType {
  if (site === "imageSrc") return "image";
  if (site === "visible") return "boolean";
  return "color";
}

export function bindNewVariable(
  document: DesignDocument,
  site: BindSite,
  name: string,
): VariableChange {
  const created = createVariable(document, {
    name,
    type: siteType(site.site),
    ...seededDefault(document, site),
  });
  if (!created.ok) return created;
  return { ok: true, document: bindProperty(created.document, site, name) };
}

export function bindProperty(
  document: DesignDocument,
  site: BindSite,
  name: string,
): DesignDocument {
  return writeSite(document, site, () => ({ $var: name }));
}

export function unbindProperty(document: DesignDocument, site: BindSite): DesignDocument {
  return writeSite(document, site, (current) => {
    if (!isVarRef(current)) return current;
    const declaration = (document.variables ?? []).find(
      (variable) => variable.name === current.$var,
    );
    return declaration === undefined ? current : writtenBack(declaration, current);
  });
}

export type UnknownToken = { name: string; elementIds: string[] };

export function unknownTokens(document: DesignDocument): UnknownToken[] {
  const declared = new Set((document.variables ?? []).map((variable) => variable.name));
  const byName = new Map<string, string[]>();
  const visit = (elements: readonly Element[]) => {
    for (const element of elements) {
      if (element.type === "group") {
        visit(element.children);
        continue;
      }
      if (element.type !== "text") continue;
      for (const name of interpolationTokens(element.content)) {
        if (declared.has(name)) continue;
        const ids = byName.get(name) ?? [];
        if (!ids.includes(element.id)) ids.push(element.id);
        byName.set(name, ids);
      }
    }
  };
  visit(document.elements);
  return [...byName].map(([name, elementIds]) => ({ name, elementIds }));
}

export function createVariableFromToken(document: DesignDocument, name: string): VariableChange {
  return createVariable(document, { name, type: "text" });
}

export type TokenQuery = { start: number; query: string };

/** The open `{{query` at the caret, if the user is inside a token. */
export function openTokenQuery(content: string, cursor: number): TokenQuery | null {
  const before = content.slice(0, cursor);
  const start = before.lastIndexOf("{{");
  if (start === -1) return null;
  const afterOpen = before.slice(start + 2);
  if (afterOpen.includes("}}")) return null;
  if (/[{}]/.test(afterOpen)) return null;
  return { start, query: afterOpen };
}

export function insertTokenName(
  content: string,
  cursor: number,
  name: string,
): { content: string; cursor: number } {
  const query = openTokenQuery(content, cursor);
  const start = query?.start ?? cursor;
  const rest = content.slice(cursor);
  const consumed = rest.match(/^[A-Za-z0-9_]*(\}\})?/)?.[0].length ?? 0;
  const next = `${content.slice(0, start)}{{${name}}}${content.slice(cursor + consumed)}`;
  return { content: next, cursor: start + name.length + 4 };
}

export function tokenSuggestions(query: string, variables: readonly VariableDecl[]): string[] {
  return variables
    .filter(
      (variable) =>
        (variable.type === "text" || variable.type === "number") && variable.name.startsWith(query),
    )
    .map((variable) => variable.name);
}

export function renameToken(document: DesignDocument, from: string, to: string): DesignDocument {
  if (from === to) return document;
  return rewriteBindings(document, {
    bind: (ref) => ref,
    content: (text) => text.replaceAll(`{{${from}}}`, `{{${to}}}`),
  });
}

function seededDefault(
  document: DesignDocument,
  site: BindSite,
): { default: string | boolean } | Record<string, never> {
  const current = readSite(document, site);
  if (typeof current === "string" || typeof current === "boolean") return { default: current };
  if (isVarRef(current)) {
    const declaration = (document.variables ?? []).find(
      (variable) => variable.name === current.$var,
    );
    const written = declaration === undefined ? current : writtenBack(declaration, current);
    if (typeof written === "string" || typeof written === "boolean") return { default: written };
  }
  return {};
}

function readSite(document: DesignDocument, site: BindSite): unknown {
  if (site.site === "background") return document.canvas.background;
  const element = findElement(document.elements, site.elementId);
  if (element === null) return undefined;
  if (site.site === "visible") return element.visible;
  if (site.site === "fill") return "fill" in element ? element.fill : undefined;
  if (site.site === "borderColor") {
    return "border" in element ? element.border?.color : undefined;
  }
  if (site.site === "textColor") return element.type === "text" ? element.color : undefined;
  return element.type === "image" ? element.src : undefined;
}

function writeSite(
  document: DesignDocument,
  site: BindSite,
  write: (current: unknown) => unknown,
): DesignDocument {
  if (site.site === "background") {
    const next = write(document.canvas.background);
    if (next === document.canvas.background) return document;
    return { ...document, canvas: { ...document.canvas, background: next as Fill | VarRef } };
  }
  return updateElement(document, site.elementId, (element) => {
    if (site.site === "visible") {
      const next = write(element.visible);
      return next === element.visible ? element : { ...element, visible: next as boolean | VarRef };
    }
    if (site.site === "fill" && "fill" in element) {
      const next = write(element.fill);
      return next === element.fill ? element : { ...element, fill: next as Fill | VarRef };
    }
    if (site.site === "borderColor" && "border" in element && element.border) {
      const next = write(element.border.color);
      return next === element.border.color
        ? element
        : { ...element, border: { ...element.border, color: next as string | VarRef } };
    }
    if (site.site === "textColor" && element.type === "text") {
      const next = write(element.color);
      return next === element.color ? element : { ...element, color: next as string | VarRef };
    }
    if (site.site === "imageSrc" && element.type === "image") {
      const next = write(element.src);
      return next === element.src ? element : { ...element, src: next as string | VarRef };
    }
    return element;
  });
}

function findElement(elements: readonly Element[], id: string): Element | null {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === "group") {
      const found = findElement(element.children, id);
      if (found !== null) return found;
    }
  }
  return null;
}

function updateElement(
  document: DesignDocument,
  id: string,
  edit: (element: Element) => Element,
): DesignDocument {
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next = elements.map((element) => {
      let candidate = element;
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) candidate = { ...element, children };
      }
      if (element.id === id) candidate = edit(candidate);
      if (candidate !== element) changed = true;
      return candidate;
    });
    return changed ? next : elements;
  };
  const elements = visit(document.elements);
  return elements === document.elements ? document : { ...document, elements };
}

function updateDeclaration(
  document: DesignDocument,
  name: string,
  change: (declaration: VariableDecl) => VariableDecl,
): DesignDocument {
  const variables = document.variables;
  if (variables === undefined) return document;
  let changed = false;
  const next = variables.map((declaration) => {
    if (declaration.name !== name) return declaration;
    const updated = change(declaration);
    if (updated !== declaration) changed = true;
    return updated;
  });
  return changed ? { ...document, variables: next } : document;
}

function writtenBack(declaration: VariableDecl, ref: VarRef): VarRef | Fill | string | boolean {
  const value = declaration.default;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (declaration.type === "boolean") return true;
  if (declaration.type === "color") return "#808080";
  return ref;
}

function isVarRef(value: unknown): value is VarRef {
  return typeof value === "object" && value !== null && "$var" in value;
}

type Visit = {
  bind: (ref: VarRef) => void;
  content: (text: string) => void;
};

function visitBindings(document: DesignDocument, visit: Visit): void {
  if (isVarRef(document.canvas.background)) visit.bind(document.canvas.background);
  visitElements(document.elements, visit);
}

function visitElements(elements: readonly Element[], visit: Visit): void {
  for (const element of elements) {
    if (isVarRef(element.visible)) visit.bind(element.visible);
    if (element.type === "group") {
      visitElements(element.children, visit);
      continue;
    }
    if ("fill" in element && isVarRef(element.fill)) visit.bind(element.fill);
    if ("border" in element && element.border && isVarRef(element.border.color)) {
      visit.bind(element.border.color);
    }
    if (element.type === "image" && isVarRef(element.src)) visit.bind(element.src);
    if (element.type === "text") {
      if (isVarRef(element.color)) visit.bind(element.color);
      visit.content(element.content);
    }
  }
}

type Rewrite = {
  bind: (ref: VarRef) => VarRef | Fill | string | boolean;
  content: (text: string) => string;
};

function rewriteBindings(document: DesignDocument, rewrite: Rewrite): DesignDocument {
  const background = rewriteFill(document.canvas.background, rewrite.bind);
  const canvas =
    background === document.canvas.background
      ? document.canvas
      : { ...document.canvas, background };
  const elements = rewriteElements(document.elements, rewrite);
  if (canvas === document.canvas && elements === document.elements) return document;
  return { ...document, canvas, elements };
}

function rewriteElements(elements: Element[], rewrite: Rewrite): Element[] {
  let changed = false;
  const next = elements.map((element) => {
    const rewritten = rewriteElement(element, rewrite);
    if (rewritten !== element) changed = true;
    return rewritten;
  });
  return changed ? next : elements;
}

function rewriteElement(element: Element, rewrite: Rewrite): Element {
  const visible = rewriteVisible(element.visible, rewrite.bind);
  let candidate: Element = visible === element.visible ? element : { ...element, visible };
  if (candidate.type === "group") {
    const children = rewriteElements(candidate.children, rewrite);
    if (children !== candidate.children) candidate = { ...candidate, children };
    return candidate;
  }
  if ("fill" in candidate) {
    const fill = rewriteFill(candidate.fill, rewrite.bind);
    if (fill !== candidate.fill) candidate = { ...candidate, fill };
  }
  if ("border" in candidate && candidate.border) {
    const border = rewriteBorder(candidate.border, rewrite.bind);
    if (border !== candidate.border) candidate = { ...candidate, border };
  }
  if (candidate.type === "image") {
    const src = rewriteSrc(candidate.src, rewrite.bind);
    if (src !== candidate.src) candidate = { ...candidate, src };
  }
  if (candidate.type === "text") {
    const color = rewriteColor(candidate.color, rewrite.bind);
    const content = rewrite.content(candidate.content);
    if (color !== candidate.color || content !== candidate.content) {
      candidate = { ...candidate, color, content };
    }
  }
  return candidate;
}

function rewriteFill(fill: Fill | VarRef, bind: Rewrite["bind"]): Fill | VarRef {
  return isVarRef(fill) ? asFill(bind(fill), fill) : fill;
}

function rewriteVisible(visible: boolean | VarRef, bind: Rewrite["bind"]): boolean | VarRef {
  if (!isVarRef(visible)) return visible;
  const next = bind(visible);
  return typeof next === "boolean" || isVarRef(next) ? next : visible;
}

function rewriteSrc(src: string | VarRef, bind: Rewrite["bind"]): string | VarRef {
  if (!isVarRef(src)) return src;
  const next = bind(src);
  return typeof next === "string" || isVarRef(next) ? next : src;
}

function rewriteColor(color: string | VarRef, bind: Rewrite["bind"]): string | VarRef {
  if (!isVarRef(color)) return color;
  const next = bind(color);
  return typeof next === "string" || isVarRef(next) ? next : color;
}

function rewriteBorder(border: Border, bind: Rewrite["bind"]): Border {
  const color = rewriteColor(border.color, bind);
  return color === border.color ? border : { ...border, color };
}

function asFill(next: ReturnType<Rewrite["bind"]>, previous: VarRef): Fill | VarRef {
  if (isVarRef(next) || typeof next === "string" || (typeof next === "object" && next !== null))
    return next as Fill | VarRef;
  return previous;
}
