import { createJob, type JobView } from "@media-canvas/api-client";
import type { VariableDecl } from "@media-canvas/core";
import Papa from "papaparse";
import { failedToChangeDocument } from "./failures.ts";
import { outputFormat, type GenerateFormat } from "./generate.ts";
import { jobPath } from "./routes.ts";

/**
 * The Batch tab: parse a CSV, map its headers onto the Template's Variables,
 * and submit the file's own bytes. Cell types stay the server's.
 */

const NAME_COLUMN = "_name";

export type HeaderMapping = {
  matched: string[];
  missingDefaulted: string[];
  missingRequired: string[];
  unknown: string[];
  nameColumn: boolean;
};

/** Five outcomes for a header row against the Template's declared Variables. */
export function mapHeaders(
  headers: readonly string[],
  variables: readonly VariableDecl[],
): HeaderMapping {
  const present = new Set(headers);
  const declared = new Set(variables.map((variable) => variable.name));
  const matched: string[] = [];
  const unknown: string[] = [];
  let nameColumn = false;
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === NAME_COLUMN) {
      nameColumn = true;
      continue;
    }
    if (seen.has(header)) continue;
    seen.add(header);
    if (declared.has(header)) matched.push(header);
    else unknown.push(header);
  }
  const missingDefaulted: string[] = [];
  const missingRequired: string[] = [];
  for (const variable of variables) {
    if (present.has(variable.name)) continue;
    if (variable.default !== undefined) missingDefaulted.push(variable.name);
    else missingRequired.push(variable.name);
  }
  return { matched, missingDefaulted, missingRequired, unknown, nameColumn };
}

export type PreparedBatch = {
  bytes: string;
  headers: string[];
  rows: string[][];
  idempotencyKey: string;
};

/** Parse the file and mint the key that travels with every submit of this parse. */
export function prepareBatch(
  csvText: string,
  options: { mintKey?: () => string } = {},
): PreparedBatch {
  const mintKey = options.mintKey ?? defaultMintKey;
  const { headers, rows } = parseCsv(csvText);
  return { bytes: csvText, headers, rows, idempotencyKey: mintKey() };
}

function defaultMintKey(): string {
  return crypto.randomUUID();
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const stripped = text.startsWith("\ufeff") ? text.slice(1) : text;
  const parsed = Papa.parse(stripped, { header: false });
  const table = asTable(parsed.data);
  const headers = table[0] ?? [];
  const rows = dropTrailingEmpty(table.slice(1));
  return { headers, rows };
}

function asTable(data: unknown[]): string[][] {
  return data.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => (cell == null ? "" : String(cell)));
  });
}

/** Papa often emits an empty record for a trailing newline; Python csv does not. */
function dropTrailingEmpty(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last !== undefined && last.every((cell) => cell === "")) return rows.slice(0, -1);
  return rows;
}

export type RefusalError = {
  rowIndex: number;
  variable?: string | null;
  message: string;
};

/** The 422 body: row-indexed errors keyed to Variable names. */
export type RefusalBody = {
  errors: readonly RefusalError[];
};

export type PreviewErrorGroup = {
  rowIndex: number;
  name: string | null;
  messages: readonly string[];
};

export type PreviewRefusal = {
  countLine: string;
  firstRowIndex: number;
  groups: readonly PreviewErrorGroup[];
  messagesByRow: ReadonlyMap<number, readonly string[]>;
};

/**
 * Overlay a refusal onto a parsed preview. The file, rows, and mapping stay;
 * this only names which data rows are wrong.
 */
export function mergeRefusal(
  preview: Pick<PreparedBatch, "headers" | "rows">,
  body: RefusalBody,
): PreviewRefusal {
  const messagesByRow = new Map<number, string[]>();
  for (const error of body.errors) {
    const messages = messagesByRow.get(error.rowIndex) ?? [];
    messages.push(namedMessage(error));
    messagesByRow.set(error.rowIndex, messages);
  }
  const indexes = [...messagesByRow.keys()].sort((a, b) => a - b);
  const groups = indexes.map((rowIndex) => ({
    rowIndex,
    name: nameOf(preview.headers, preview.rows[rowIndex]),
    messages: messagesByRow.get(rowIndex) ?? [],
  }));
  const count = groups.length;
  return {
    countLine: `${String(count)} ${count === 1 ? "row" : "rows"} invalid; nothing was submitted`,
    firstRowIndex: indexes[0] ?? 0,
    groups,
    messagesByRow,
  };
}

function namedMessage(error: RefusalError): string {
  const variable = error.variable;
  if (variable == null || variable === "") return error.message;
  return `${variable}: ${error.message}`;
}

function nameOf(headers: readonly string[], row: readonly string[] | undefined): string | null {
  const column = headers.indexOf(NAME_COLUMN);
  if (column < 0 || row === undefined) return null;
  const value = row[column];
  if (value === undefined || value === "") return null;
  return value;
}

export type SubmitBatchRequest = {
  templateId: string;
  bytes: string;
  format: GenerateFormat;
  idempotencyKey: string;
};

export type SubmitBatchResult =
  | { ok: true; jobId: string; path: string }
  | { ok: false; message: string; refusal: null }
  | { ok: false; message: null; refusal: RefusalBody };

export type CreateJobCall = (options: {
  path: { templateId: string };
  body: string;
  query: {
    format: "png" | "jpeg" | "pdf";
    scale?: 1 | 2 | 3;
    quality?: number;
    idempotencyKey: string;
  };
  headers: { "Content-Type": "text/csv" };
  bodySerializer: null;
}) => Promise<{
  data?: JobView;
  error?: unknown;
  response?: { status?: number };
}>;

/**
 * Send the file's own bytes. Format and the idempotency key travel as query
 * parameters. The client never types a cell and never builds JSON rows.
 */
export async function submitBatch(
  request: SubmitBatchRequest,
  create: CreateJobCall = createJob as CreateJobCall,
): Promise<SubmitBatchResult> {
  const { data, error, response } = await create({
    path: { templateId: request.templateId },
    body: request.bytes,
    query: jobQuery(request.format, request.idempotencyKey),
    headers: { "Content-Type": "text/csv" },
    bodySerializer: null,
  });
  if (data !== undefined && typeof data.id === "string" && data.id !== "") {
    return { ok: true, jobId: data.id, path: jobPath(data.id) };
  }
  const refusal = asRefusal(error);
  if (refusal !== null) {
    return { ok: false, message: null, refusal };
  }
  return { ok: false, message: failedToChangeDocument(response?.status), refusal: null };
}

function asRefusal(error: unknown): RefusalBody | null {
  if (typeof error !== "object" || error === null || !("errors" in error)) return null;
  const { errors } = error;
  if (!Array.isArray(errors)) return null;
  return error as RefusalBody;
}

function jobQuery(
  format: GenerateFormat,
  idempotencyKey: string,
): {
  format: "png" | "jpeg" | "pdf";
  scale?: 1 | 2 | 3;
  quality?: number;
  idempotencyKey: string;
} {
  const output = outputFormat(format);
  if (output.format === "png") {
    return { format: "png", scale: output.scale, idempotencyKey };
  }
  if (output.format === "jpeg") {
    return { format: "jpeg", quality: output.quality, idempotencyKey };
  }
  return { format: "pdf", idempotencyKey };
}
