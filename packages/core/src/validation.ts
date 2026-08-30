import { z } from "zod";

import type { DesignDocument, Element, VarRef, VariableType } from "./document.ts";

export type ValidationError = {
  variable?: string;
  elementId?: string;
  assetId?: string;
  message: string;
};

export const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const INTERPOLATION_TOKEN = /\{\{([^{}]*)\}\}/g;

export function interpolationTokens(content: string): string[] {
  return [...content.matchAll(INTERPOLATION_TOKEN)].map((match) => match[1] ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVarRef(value: unknown): value is VarRef {
  return isRecord(value) && "$var" in value;
}

function oneOf(expected: string, pick: (value: unknown) => z.ZodType | undefined): z.ZodType {
  return z.unknown().superRefine((value, ctx) => {
    const schema = pick(value);
    if (!schema) {
      ctx.addIssue({ code: "custom", message: expected });
      return;
    }
    const result = schema.safeParse(value);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
  });
}

const number = z.number({ error: "must be a number" });
const nonNegative = number.min(0, { error: "must not be negative" });
const unitInterval = number
  .min(0, { error: "must be between 0 and 1" })
  .max(1, { error: "must be between 0 and 1" });

const colorSchema = z
  .string({ error: "must be a string" })
  .regex(COLOR_PATTERN, { error: "must be a #RRGGBB or #RRGGBBAA color" });

const varRefSchema = z.object({
  $var: z.string({ error: "must be a string" }).min(1, { error: "must not be empty" }),
});

const gradientStopSchema = z.object({
  offset: unitInterval,
  color: colorSchema,
});

const linearGradientSchema = z.object({
  type: z.literal("linear"),
  angle: number,
  stops: z.array(gradientStopSchema),
});

const radialGradientSchema = z.object({
  type: z.literal("radial"),
  stops: z.array(gradientStopSchema),
});

const FILL_EXPECTED =
  "must be a #RRGGBB or #RRGGBBAA color, a linear or radial gradient, or a Variable reference";

const fillSchema = oneOf(FILL_EXPECTED, (value) => {
  if (typeof value === "string") return colorSchema;
  if (isVarRef(value)) return varRefSchema;
  if (isRecord(value) && value["type"] === "linear") return linearGradientSchema;
  if (isRecord(value) && value["type"] === "radial") return radialGradientSchema;
  return undefined;
});

const colorOrVarRefSchema = oneOf(
  "must be a #RRGGBB or #RRGGBBAA color or a Variable reference",
  (value) => {
    if (typeof value === "string") return colorSchema;
    if (isVarRef(value)) return varRefSchema;
    return undefined;
  },
);

const stringOrVarRefSchema = oneOf("must be a string or a Variable reference", (value) => {
  if (typeof value === "string") return z.string().min(1, { error: "must not be empty" });
  if (isVarRef(value)) return varRefSchema;
  return undefined;
});

const booleanOrVarRefSchema = oneOf("must be a boolean or a Variable reference", (value) => {
  if (typeof value === "boolean") return z.boolean();
  if (isVarRef(value)) return varRefSchema;
  return undefined;
});

const cornerRadiusSchema = oneOf(
  "must be a number or an object with topLeft, topRight, bottomRight, and bottomLeft",
  (value) => {
    if (typeof value === "number") return nonNegative;
    if (isRecord(value) && !isVarRef(value)) {
      return z.object({
        topLeft: nonNegative,
        topRight: nonNegative,
        bottomRight: nonNegative,
        bottomLeft: nonNegative,
      });
    }
    return undefined;
  },
);

const clipSchema = oneOf('must be "none", "ellipse", or an object with a path', (value) => {
  if (typeof value === "string") {
    return z.enum(["none", "ellipse"], { error: 'must be "none" or "ellipse"' });
  }
  if (isRecord(value) && !isVarRef(value)) {
    return z.object({ path: z.string({ error: "must be a string" }) });
  }
  return undefined;
});

const shadowSchema = z.object({
  dx: number,
  dy: number,
  blur: nonNegative,
  color: colorSchema,
  opacity: unitInterval,
});

const borderSchema = z.object({
  color: colorOrVarRefSchema,
  width: nonNegative,
});

const elementBase = {
  id: z.string({ error: "must be a string" }).min(1, { error: "must not be empty" }),
  name: z.string({ error: "must be a string" }).optional(),
  x: number,
  y: number,
  rotation: number,
  opacity: unitInterval,
  visible: booleanOrVarRefSchema,
};

const rectSchema = z.object({
  ...elementBase,
  type: z.literal("rect"),
  width: nonNegative,
  height: nonNegative,
  fill: fillSchema,
  cornerRadius: cornerRadiusSchema.optional(),
  border: borderSchema.optional(),
  shadow: shadowSchema.optional(),
});

const ellipseSchema = z.object({
  ...elementBase,
  type: z.literal("ellipse"),
  width: nonNegative,
  height: nonNegative,
  fill: fillSchema,
  border: borderSchema.optional(),
  shadow: shadowSchema.optional(),
});

const vectorSchema = z.object({
  ...elementBase,
  type: z.literal("vector"),
  width: nonNegative,
  height: nonNegative,
  path: z.string({ error: "must be a string" }),
  viewBox: z.object({ width: nonNegative, height: nonNegative }),
  fill: fillSchema,
  border: borderSchema.optional(),
  shadow: shadowSchema.optional(),
});

const imageSchema = z.object({
  ...elementBase,
  type: z.literal("image"),
  width: nonNegative,
  height: nonNegative,
  src: stringOrVarRefSchema,
  naturalWidth: nonNegative,
  naturalHeight: nonNegative,
  content: z.object({ offsetX: number, offsetY: number, scale: number }).optional(),
  fitMode: z.enum(["cover", "contain", "stretch"], {
    error: 'must be "cover", "contain", or "stretch"',
  }),
  clip: clipSchema,
  cornerRadius: cornerRadiusSchema.optional(),
  border: borderSchema.optional(),
  shadow: shadowSchema.optional(),
});

const textSchema = z.object({
  ...elementBase,
  type: z.literal("text"),
  width: nonNegative,
  content: z.string({ error: "must be a string" }),
  fontAssetId: z.string({ error: "must be a string" }).min(1, { error: "must not be empty" }),
  fontSize: nonNegative,
  lineHeight: number,
  letterSpacing: number,
  align: z.enum(["left", "center", "right"], { error: 'must be "left", "center", or "right"' }),
  anchor: z.enum(["top", "middle", "bottom"], { error: 'must be "top", "middle", or "bottom"' }),
  color: colorOrVarRefSchema,
  shadow: shadowSchema.optional(),
});

const groupSchema = z.object({
  ...elementBase,
  type: z.literal("group"),
  children: z.array(z.lazy(() => elementSchema)),
});

const elementSchema: z.ZodType = z.discriminatedUnion(
  "type",
  [rectSchema, ellipseSchema, vectorSchema, imageSchema, textSchema, groupSchema],
  { error: 'must be one of "rect", "ellipse", "vector", "image", "text", or "group"' },
);

const variableName = z.string({ error: "must be a string" }).min(1, { error: "must not be empty" });

const variableDeclSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      name: variableName,
      type: z.literal("text"),
      default: z
        .string({ error: "must be a string, matching the Variable's text type" })
        .optional(),
      constraints: z
        .object({ maxLength: nonNegative.optional(), minLength: nonNegative.optional() })
        .optional(),
    }),
    z.object({
      name: variableName,
      type: z.literal("image"),
      default: z
        .string({ error: "must be a string, matching the Variable's image type" })
        .min(1, { error: "must not be empty" })
        .optional(),
    }),
    z.object({
      name: variableName,
      type: z.literal("color"),
      default: colorSchema.optional(),
    }),
    z.object({
      name: variableName,
      type: z.literal("number"),
      default: z
        .number({ error: "must be a number, matching the Variable's number type" })
        .optional(),
    }),
    z.object({
      name: variableName,
      type: z.literal("boolean"),
      default: z
        .boolean({ error: "must be a boolean, matching the Variable's boolean type" })
        .optional(),
    }),
  ],
  { error: 'must be one of "text", "image", "color", "number", or "boolean"' },
);

const documentSchema = z.object({
  schemaVersion: z.literal(1, {
    error: "must be the integer 1 — this core accepts no other schema version",
  }),
  canvas: z.object({
    width: nonNegative,
    height: nonNegative,
    background: fillSchema,
  }),
  variables: z.array(variableDeclSchema).optional(),
  elements: z.array(elementSchema),
});

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((step) => (typeof step === "number" ? `[${String(step)}]` : `.${String(step)}`))
    .join("")
    .replace(/^\./, "");
}

function elementIdAtPath(root: unknown, path: readonly PropertyKey[]): string | undefined {
  let current: unknown = root;
  let elementId: string | undefined;
  for (const step of path) {
    if (isRecord(current) && typeof current["id"] === "string") elementId = current["id"];
    if (Array.isArray(current) && typeof step === "number") current = current[step];
    else if (isRecord(current)) current = current[step as string];
    else return elementId;
  }
  if (isRecord(current) && typeof current["id"] === "string") elementId = current["id"];
  return elementId;
}

function variableAtPath(root: unknown, path: readonly PropertyKey[]): string | undefined {
  if (path[0] !== "variables" || typeof path[1] !== "number") return undefined;
  const declarations = isRecord(root) ? root["variables"] : undefined;
  if (!Array.isArray(declarations)) return undefined;
  const declaration: unknown = declarations[path[1]];
  return isRecord(declaration) && typeof declaration["name"] === "string"
    ? declaration["name"]
    : undefined;
}

function valueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root;
  for (const step of path) {
    if (Array.isArray(current) && typeof step === "number") current = current[step];
    else if (isRecord(current)) current = current[step as string];
    else return undefined;
  }
  return current;
}

const VAR_REF_NOT_PERMITTED =
  "a Variable reference is not permitted here — v1 binds a Variable to text content tokens, " +
  "image source, solid colors, and visibility only";

function shapeErrors(doc: unknown, issues: readonly z.core.$ZodIssue[]): ValidationError[] {
  return issues.map((issue) => {
    const path = formatPath(issue.path);
    const value = valueAtPath(doc, issue.path);
    const missing = issue.code === "invalid_type" && issue.message.includes("received undefined");
    const message = isVarRef(value)
      ? VAR_REF_NOT_PERMITTED
      : missing
        ? "is required"
        : issue.message;
    const elementId = elementIdAtPath(doc, issue.path);
    const variable = variableAtPath(doc, issue.path);
    return {
      message: path ? `${path}: ${message}` : message,
      ...(elementId === undefined ? {} : { elementId }),
      ...(variable === undefined ? {} : { variable }),
    };
  });
}

function walkElements(elements: readonly Element[], visit: (element: Element) => void): void {
  for (const element of elements) {
    visit(element);
    if (element.type === "group") walkElements(element.children, visit);
  }
}

function duplicateIdErrors(doc: DesignDocument): ValidationError[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const errors: ValidationError[] = [];
  walkElements(doc.elements, (element) => {
    if (seen.has(element.id) && !reported.has(element.id)) {
      reported.add(element.id);
      errors.push({
        elementId: element.id,
        message: `duplicate element id "${element.id}" — element ids are unique across the whole document`,
      });
    }
    seen.add(element.id);
  });
  return errors;
}

function duplicateVariableErrors(doc: DesignDocument): ValidationError[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const errors: ValidationError[] = [];
  for (const declaration of doc.variables ?? []) {
    if (seen.has(declaration.name) && !reported.has(declaration.name)) {
      reported.add(declaration.name);
      errors.push({
        variable: declaration.name,
        message: `duplicate Variable name "${declaration.name}" — Variable names are unique in a document`,
      });
    }
    seen.add(declaration.name);
  }
  return errors;
}

type Reference = {
  name: string;
  site: string;
  elementId?: string;
  accepts: readonly VariableType[];
};

const SOLID_COLOR: readonly VariableType[] = ["color"];
const TOKEN: readonly VariableType[] = ["text", "number"];

function references(doc: DesignDocument): Reference[] {
  const found: Reference[] = [];
  const add = (
    value: unknown,
    site: string,
    accepts: readonly VariableType[],
    elementId?: string,
  ): void => {
    if (!isVarRef(value)) return;
    found.push({
      name: value.$var,
      site,
      accepts,
      ...(elementId === undefined ? {} : { elementId }),
    });
  };
  add(doc.canvas.background, "canvas background", SOLID_COLOR);
  walkElements(doc.elements, (element) => {
    add(element.visible, "visible", ["boolean"], element.id);
    if ("fill" in element) add(element.fill, "fill", SOLID_COLOR, element.id);
    if ("border" in element && element.border)
      add(element.border.color, "border color", SOLID_COLOR, element.id);
    if (element.type === "image") add(element.src, "image source", ["image"], element.id);
    if (element.type === "text") {
      add(element.color, "text color", SOLID_COLOR, element.id);
      for (const token of interpolationTokens(element.content)) {
        found.push({
          name: token,
          site: `content token {{${token}}}`,
          accepts: TOKEN,
          elementId: element.id,
        });
      }
    }
  });
  return found;
}

function listTypes(types: readonly VariableType[]): string {
  const named = types.map((type) => `a ${type}`);
  return named.length < 2
    ? (named[0] ?? "no")
    : `${named.slice(0, -1).join(", ")} or ${String(named.at(-1))}`;
}

function referenceTypeErrors(doc: DesignDocument): ValidationError[] {
  const declared = new Map((doc.variables ?? []).map((decl) => [decl.name, decl.type]));
  const errors: ValidationError[] = [];
  for (const reference of references(doc)) {
    const type = declared.get(reference.name);
    if (type === undefined || reference.accepts.includes(type)) continue;
    errors.push({
      variable: reference.name,
      ...(reference.elementId === undefined ? {} : { elementId: reference.elementId }),
      message: `${reference.site} names the Variable "${reference.name}", which is declared ${type} — that site takes ${listTypes(reference.accepts)} Variable`,
    });
  }
  return errors;
}

function unknownVariableErrors(doc: DesignDocument): ValidationError[] {
  const declared = new Set((doc.variables ?? []).map((declaration) => declaration.name));
  const reported = new Set<string>();
  const errors: ValidationError[] = [];
  for (const reference of references(doc)) {
    if (declared.has(reference.name)) continue;
    const key = `${reference.elementId ?? ""} ${reference.name}`;
    if (reported.has(key)) continue;
    reported.add(key);
    errors.push({
      variable: reference.name,
      ...(reference.elementId === undefined ? {} : { elementId: reference.elementId }),
      message: `${reference.site} names the Variable "${reference.name}", which the document does not declare`,
    });
  }
  return errors;
}

export function validateDocument(doc: unknown): ValidationError[] {
  const result = documentSchema.safeParse(doc);
  if (!result.success) return shapeErrors(doc, result.error.issues);
  const document = result.data as DesignDocument;
  return [
    ...duplicateIdErrors(document),
    ...duplicateVariableErrors(document),
    ...unknownVariableErrors(document),
    ...referenceTypeErrors(document),
  ];
}
