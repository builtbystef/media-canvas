// Variable values: what a row of them must satisfy, and what a Template plus a
// row resolves to. Generation runs `validate` and then `resolve`, so a bad row
// fails before anything is drawn and a good one yields a plain Design Document
// with no Variables left in it.

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

/** A value is omitted when the caller supplies none: JSON carries no
 *  `undefined`, so a key holding one is the same as no key at all. Explicit
 *  `null` is a value, and a wrongly typed one. */
function isOmitted(values: Record<string, unknown>, name: string): boolean {
  return values[name] === undefined;
}

/**
 * Validate a row of values against a Template: an empty list means `resolve`
 * will succeed. Every problem names the Variable it is about.
 */
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

/** Types are strict: a value is what its Variable declares or it is an error.
 *  Nothing is coerced here — a CSV cell is typed before it ever arrives. */
function valueErrors(declaration: VariableDecl, value: unknown): ValidationError[] {
  switch (declaration.type) {
    case "text":
      if (typeof value !== "string") return [valueError(declaration, "must be a string")];
      return lengthErrors(declaration, value);
    case "number":
      // An infinity or a NaN would interpolate as a word; JSON carries neither.
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

/** The v1 constraints, text only: `""` is a legal value everywhere else, and
 *  `minLength: 1` is how a Variable says it is required. */
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

/** Anything carrying a URI scheme is a URL, and only `http(s)` is fetchable at
 *  render time; everything else is read as an Image Asset id, which is one
 *  opaque token — the worker resolves it, so the shape is all core can judge. */
function isImageReference(value: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return /^https?:\/\//.test(value);
  return value.length > 0 && !/\s/.test(value);
}

/**
 * Type a Row of CSV cells against a Template, so that validation and rendering
 * see the values a JSON Row would have carried. Every cell arrives as a string
 * — a CSV knows no types — and this is the one place in the system where
 * `"4.99"` becomes the number 4.99, so no service can grow a second reading of
 * a cell. Errors name the Variable, and the cells they are about carry no
 * value onward: an unreadable cell is a problem with the cell, and reporting
 * it again as an omission would be one problem told twice.
 */
export function typeCells(
  template: DesignDocument,
  cells: Record<string, string>,
): { values: Record<string, unknown>; errors: ValidationError[] } {
  const values: Record<string, unknown> = {};
  const errors: ValidationError[] = [];
  for (const declaration of template.variables ?? []) {
    const cell = cells[declaration.name];
    // An absent column and an empty cell are one thing: the Variable was
    // omitted, so its default applies. A CSV has no way to say "the empty
    // string" — that value needs the JSON channel.
    if (cell === undefined || cell === "") continue;
    const typed = typeCell(declaration, cell);
    if (typed.error === undefined) values[declaration.name] = typed.value;
    else errors.push(typed.error);
  }
  return { values, errors };
}

/** What one cell means for one Variable. Text, color and image Variables take
 *  the cell as it stands — `validate` judges the string itself. */
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

/** The JSON number grammar, which is the one number syntax this system reads:
 *  no leading plus, no leading zero, no bare `.5`, no trailing `.`. */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * How a Template resolves. Generation resolves in "generate": every Variable
 * has a value by then, because `validate` rejected the row otherwise, and one
 * that does not is a mistake worth throwing over rather than drawing around.
 * The editor resolves in "preview", where a Template whose Variables have no
 * values yet still has to show something.
 */
export type ResolveMode = "generate" | "preview";

/** The values one resolution draws on — a value per Variable the row supplies,
 *  and the declared default for every Variable it omits — and what to do about
 *  a Variable that has neither. */
type Resolution = {
  values: Map<string, string | number | boolean>;
  mode: ResolveMode;
};

/** What a preview shows at a color site with no value: a neutral gray, which
 *  is also the image frame's fill. */
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

/** The value bound to a Variable at a site that expects one of `guard`'s type.
 *  Generation runs `validate` first, so anything missing or mistyped by the
 *  time it reaches here is a mistake in the pipeline, not something to paint. */
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

/** Generation resolves only rows `validate` passed, so a Variable with no
 *  usable value here means the pipeline skipped that step. */
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

/** A Variable with no value previews as visible: a preview that hid the element
 *  would be a preview of nothing. */
function resolveVisible(visible: boolean | VarRef, resolution: Resolution): boolean {
  return isVarRef(visible) ? (bound(visible, isBoolean, resolution) ?? true) : visible;
}

/** Tokens substitute before layout, so what wraps is what a reader sees. A
 *  number interpolates as `String(number)` — both sides of the render are
 *  JavaScript, so both spell it the same way. */
function resolveContent(content: string, resolution: Resolution): string {
  return content.replaceAll(INTERPOLATION_TOKEN, (token, name: string) => {
    const value = resolution.values.get(name);
    if (value !== undefined) return String(value);
    // A preview shows the token itself, so the author sees which Variable is
    // still empty; generation would be shipping that text to a customer.
    if (resolution.mode === "preview") return token;
    throw unfilled(name);
  });
}

/** An image whose source came from a Variable loses the crop authored for the
 *  placeholder image, so the compiler places the supplied one by Fit Mode. With
 *  no source to place — a preview only — the frame previews flat gray. */
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

/** The frame an unfilled image would fill, flat gray: a Design Document says
 *  "no image here" with a shape, having no way to say it with an image. */
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

/** `border` stays absent when the element declares none: an explicit
 *  `undefined` is not the same as no property at all. */
function withBorder(border: Border | undefined, resolution: Resolution): { border?: Border } {
  const resolved = resolveBorder(border, resolution);
  return resolved === undefined ? {} : { border: resolved };
}

/**
 * Apply a row of values to a Template, yielding a plain Design Document: no
 * Variable declarations, no Variable references, and no `{{name}}` tokens left
 * to substitute. Run `validate` first — resolving unvalidated values throws.
 */
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
    // Only a value of a type a document can hold is worth carrying: anything
    // else `validate` has already rejected, and resolving it is a mistake to
    // throw over rather than a value to substitute.
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
