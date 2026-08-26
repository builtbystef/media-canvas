import {
  renderDocument,
  type NamedProblem,
  type OutputFormat,
  type RenderBody,
  type RenderRefusal,
} from "@media-canvas/api-client";
import type { DesignDocument, VariableDecl } from "@media-canvas/core";
import { validate } from "@media-canvas/core";
import { failedToChangeDocument } from "./failures";

/**
 * The Generate dialog: values, the format picker, and the one render call.
 *
 * Constraints are core's `validate` — the same check a batch would run —
 * so a field that would fail generation already says so before the request.
 */

/** One value per Variable, each Variable's default, or the type's empty. */
export function initialValues(document: DesignDocument): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const variable of document.variables ?? []) {
    values[variable.name] = valueFor(variable);
  }
  return values;
}

function valueFor(variable: VariableDecl): unknown {
  if (variable.default !== undefined) return variable.default;
  switch (variable.type) {
    case "text":
      return "";
    case "boolean":
      return false;
    case "number":
    case "color":
    case "image":
      return undefined;
  }
}

/** Per-Variable messages that block Generate, keyed by name. */
export function fieldErrors(
  document: DesignDocument,
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const error of validate(valuesOnly(document), values)) {
    if (error.variable === undefined || error.variable in errors) continue;
    errors[error.variable] = error.message;
  }
  return errors;
}

/** The declarations alone, so a canvas problem cannot hide a value error. */
function valuesOnly(document: DesignDocument): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 1, height: 1, background: "#FFFFFF" },
    variables: document.variables ?? [],
    elements: [],
  };
}

/** The formats the picker offers, in that order. Exactly one is chosen. */
export const GENERATE_FORMATS = ["png", "jpeg", "pdf"] as const;

export type GenerateFormatKind = (typeof GENERATE_FORMATS)[number];

export type GenerateFormat =
  | { format: "png"; scale: 1 | 2 | 3 }
  | { format: "jpeg"; quality?: number }
  | { format: "pdf" };

/** PNG at one times, until the picker is touched. */
export const DEFAULT_GENERATE_FORMAT: GenerateFormat = { format: "png", scale: 1 };

const JPEG_QUALITY_DEFAULT = 90;

/** The picker choice as the render endpoint takes it. JPEG quality defaults to 90. */
export function outputFormat(choice: GenerateFormat): OutputFormat {
  if (choice.format === "png") return { format: "png", scale: choice.scale };
  if (choice.format === "jpeg") {
    return { format: "jpeg", quality: jpegQuality(choice.quality) };
  }
  return { format: "pdf" };
}

function jpegQuality(quality: number | undefined): number {
  if (quality === undefined || !Number.isFinite(quality)) return JPEG_QUALITY_DEFAULT;
  return Math.min(100, Math.max(1, Math.round(quality)));
}

const EXTENSION: Record<GenerateFormatKind, string> = {
  png: "png",
  jpeg: "jpg",
  pdf: "pdf",
};

/** The file the browser saves, named after the document. */
export function downloadName(documentName: string, choice: GenerateFormat): string {
  return `${documentName}.${EXTENSION[choice.format]}`;
}

export type GenerateRequest = {
  documentId: string;
  name: string;
  kind: "design" | "template";
  values: Record<string, unknown>;
  format: GenerateFormat;
};

export type GenerateResult =
  | { ok: true; file: Blob; filename: string }
  | { ok: false; fieldErrors: Record<string, string>; message: string | null };

export type RenderCall = (options: { path: { documentId: string }; body: RenderBody }) => Promise<{
  data?: Blob | File;
  error?: unknown;
  response?: { status?: number };
}>;

/**
 * The one generate: render, then hand the bytes over as a named file.
 *
 * A design is format only — leftover values are dropped, never sent. A
 * template sends the form. Nothing else is called; the document is untouched.
 */
export async function generateDocument(
  request: GenerateRequest,
  render: RenderCall = renderDocument,
): Promise<GenerateResult> {
  const { data, error, response } = await render({
    path: { documentId: request.documentId },
    body: renderBody(request),
  });
  if (data instanceof Blob) {
    return { ok: true, file: data, filename: downloadName(request.name, request.format) };
  }
  const refusal = asRefusal(error);
  if (refusal !== null) return refused(refusal);
  return {
    ok: false,
    fieldErrors: {},
    message: failedToChangeDocument(response?.status),
  };
}

function renderBody(request: GenerateRequest): RenderBody {
  const output = outputFormat(request.format);
  if (request.kind === "design") return { output };
  return { output, values: sentValues(request.values) };
}

function sentValues(values: Record<string, unknown>): Record<string, unknown> {
  const sent: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) sent[name] = value;
  }
  return sent;
}

function asRefusal(error: unknown): RenderRefusal | null {
  if (typeof error !== "object" || error === null || !("errors" in error)) return null;
  const { errors } = error;
  if (!Array.isArray(errors)) return null;
  return { errors: errors as NamedProblem[] };
}

function refused(refusal: RenderRefusal): Extract<GenerateResult, { ok: false }> {
  const fieldErrors: Record<string, string> = {};
  const unnamed: string[] = [];
  for (const problem of refusal.errors) {
    const name = problem.variable;
    if (typeof name === "string" && name !== "") {
      if (!(name in fieldErrors)) fieldErrors[name] = problem.message;
    } else {
      unnamed.push(problem.message);
    }
  }
  return {
    ok: false,
    fieldErrors,
    message: unnamed.length === 0 ? null : unnamed.join(" "),
  };
}
