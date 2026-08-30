import type {
  Border,
  Color,
  DesignDocument,
  Element,
  Fill,
  ImageElement,
  RectElement,
  VarRef,
  VariableDecl,
} from "./document.ts";
import type { ValidationError } from "./validation.ts";
import { COLOR_PATTERN, INTERPOLATION_TOKEN, validateDocument } from "./validation.ts";

function isOmitted(values: Record<string, unknown>, name: string): boolean {
  return values[name] === undefined;
}

export function validate(
  template: DesignDocument,
  values: Record<string, unknown>,
): ValidationError[] {
  const documentErrors = validateDocument(template);
  if (documentErrors.length > 0) return documentErrors;

  const errors: ValidationError[] = [];
  for (const declaration of template.variables ?? []) {
    if (isOmitted(values, declaration.name)) {
      if (declaration.default === undefined) errors.push(missingValueError(declaration));
      continue;
    }
    errors.push(...valueErrors(declaration, values[declaration.name]));
  }
  return errors;
}

function missingValueError(declaration: VariableDecl): ValidationError {
  return valueError(declaration, "requires a value — it declares no default");
}

function valueError(declaration: VariableDecl, requirement: string): ValidationError {
  return {
    variable: declaration.name,
    message: `the Variable "${declaration.name}" ${requirement}`,
  };
}

function valueErrors(declaration: VariableDecl, value: unknown): ValidationError[] {
  switch (declaration.type) {
    case "text":
      if (typeof value !== "string") return [valueError(declaration, "must be a string")];
      return lengthErrors(declaration, value);
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return [valueError(declaration, "must be a number")];
      }
      return [];
    case "boolean":
      if (typeof value !== "boolean") return [valueError(declaration, "must be a boolean")];
      return [];
    case "color":
      if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
        return [valueError(declaration, "must be a #RRGGBB or #RRGGBBAA color")];
      }
      return [];
    case "image":
      if (typeof value !== "string" || !isImageReference(value)) {
        return [valueError(declaration, "must be an Image Asset id or an http(s) URL")];
      }
      return [];
  }
}

function lengthErrors(declaration: VariableDecl, value: string): ValidationError[] {
  const { minLength, maxLength } = declaration.constraints ?? {};
  if (minLength !== undefined && value.length < minLength) {
    return [valueError(declaration, `must be at least ${String(minLength)} characters long`)];
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return [valueError(declaration, `must be at most ${String(maxLength)} characters long`)];
  }
  return [];
}

function isImageReference(value: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return /^https?:\/\//.test(value);
  return value.length > 0 && !/\s/.test(value);
}

export function typeCells(
  template: DesignDocument,
  cells: Record<string, string>,
): { values: Record<string, unknown>; errors: ValidationError[] } {
  const values: Record<string, unknown> = {};
  const errors: ValidationError[] = [];
  for (const declaration of template.variables ?? []) {
    const cell = cells[declaration.name];
    if (cell === undefined || cell === "") continue;
    const typed = typeCell(declaration, cell);
    if (typed.error === undefined) values[declaration.name] = typed.value;
    else errors.push(typed.error);
  }
  return { values, errors };
}

function typeCell(
  declaration: VariableDecl,
  cell: string,
): { value?: unknown; error?: ValidationError } {
  switch (declaration.type) {
    case "number":
      if (!JSON_NUMBER.test(cell) || !Number.isFinite(Number(cell))) {
        return { error: valueError(declaration, `cannot read the cell "${cell}" as a number`) };
      }
      return { value: Number(cell) };
    case "boolean":
      if (cell !== "true" && cell !== "false") {
        return {
          error: valueError(
            declaration,
            `cannot read the cell "${cell}" as a boolean — write exactly true or false`,
          ),
        };
      }
      return { value: cell === "true" };
    case "text":
    case "color":
    case "image":
      return { value: cell };
  }
}

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export type ResolveMode = "generate" | "preview";

type Resolution = {
  values: Map<string, string | number | boolean>;
  mode: ResolveMode;
};

const PREVIEW_COLOR = "#808080";

function isVarRef(value: unknown): value is VarRef {
  return typeof value === "object" && value !== null && "$var" in value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function bound<T>(
  reference: VarRef,
  guard: (value: unknown) => value is T,
  resolution: Resolution,
): T | undefined {
  const value = resolution.values.get(reference.$var);
  if (guard(value)) return value;
  if (resolution.mode === "preview") return undefined;
  throw unfilled(reference.$var);
}

function unfilled(name: string): Error {
  return new Error(
    `resolve has no usable value for the Variable "${name}" — ` +
      "validate the values against the Template before resolving them",
  );
}

function resolveFill(fill: Fill | VarRef, resolution: Resolution): Fill {
  return isVarRef(fill) ? (bound(fill, isString, resolution) ?? PREVIEW_COLOR) : fill;
}

function resolveColor(color: Color | VarRef, resolution: Resolution): Color {
  return isVarRef(color) ? (bound(color, isString, resolution) ?? PREVIEW_COLOR) : color;
}

function resolveBorder(border: Border | undefined, resolution: Resolution): Border | undefined {
  return border === undefined
    ? border
    : { ...border, color: resolveColor(border.color, resolution) };
}

function resolveVisible(visible: boolean | VarRef, resolution: Resolution): boolean {
  return isVarRef(visible) ? (bound(visible, isBoolean, resolution) ?? true) : visible;
}

function resolveContent(content: string, resolution: Resolution): string {
  return content.replaceAll(INTERPOLATION_TOKEN, (token, name: string) => {
    const value = resolution.values.get(name);
    if (value !== undefined) return String(value);
    if (resolution.mode === "preview") return token;
    throw unfilled(name);
  });
}

function resolveImage(
  element: ImageElement & { visible: boolean },
  resolution: Resolution,
): Element {
  if (!isVarRef(element.src)) return element;
  const src = bound(element.src, isString, resolution);
  if (src === undefined) return grayFrame(element);
  const { content: _authoredCrop, ...cropless } = element;
  return { ...cropless, src };
}

function grayFrame(element: ImageElement & { visible: boolean }): RectElement {
  const { id, name, x, y, width, height, rotation, opacity, visible } = element;
  const { cornerRadius, border, shadow } = element;
  return {
    id,
    type: "rect",
    x,
    y,
    width,
    height,
    rotation,
    opacity,
    visible,
    fill: PREVIEW_COLOR,
    ...(name === undefined ? {} : { name }),
    ...(cornerRadius === undefined ? {} : { cornerRadius }),
    ...(border === undefined ? {} : { border }),
    ...(shadow === undefined ? {} : { shadow }),
  };
}

function resolveElement(element: Element, resolution: Resolution): Element {
  const base = { ...element, visible: resolveVisible(element.visible, resolution) };
  switch (base.type) {
    case "rect":
    case "ellipse":
    case "vector":
      return {
        ...base,
        fill: resolveFill(base.fill, resolution),
        ...withBorder(base.border, resolution),
      };
    case "image":
      return resolveImage({ ...base, ...withBorder(base.border, resolution) }, resolution);
    case "text":
      return {
        ...base,
        content: resolveContent(base.content, resolution),
        color: resolveColor(base.color, resolution),
      };
    case "group":
      return {
        ...base,
        children: base.children.map((child) => resolveElement(child, resolution)),
      };
  }
}

function withBorder(border: Border | undefined, resolution: Resolution): { border?: Border } {
  const resolved = resolveBorder(border, resolution);
  return resolved === undefined ? {} : { border: resolved };
}

export function resolve(
  template: DesignDocument,
  values: Record<string, unknown>,
  mode: ResolveMode = "generate",
): DesignDocument {
  const resolution: Resolution = { values: new Map(), mode };
  for (const declaration of template.variables ?? []) {
    const value = isOmitted(values, declaration.name)
      ? declaration.default
      : values[declaration.name];
    if (isString(value) || typeof value === "number" || isBoolean(value)) {
      resolution.values.set(declaration.name, value);
    }
  }
  const { variables: _declarations, ...document } = template;
  return {
    ...document,
    canvas: { ...template.canvas, background: resolveFill(template.canvas.background, resolution) },
    elements: template.elements.map((element) => resolveElement(element, resolution)),
  };
}
