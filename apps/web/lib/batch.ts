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

export type SubmitBatchRequest = {
  templateId: string;
  bytes: string;
  format: GenerateFormat;
  idempotencyKey: string;
};

export type SubmitBatchResult =
  | { ok: true; jobId: string; path: string }
  | { ok: false; message: string };

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
  const { data, response } = await create({
    path: { templateId: request.templateId },
    body: request.bytes,
    query: jobQuery(request.format, request.idempotencyKey),
    headers: { "Content-Type": "text/csv" },
    bodySerializer: null,
  });
  if (data !== undefined && typeof data.id === "string" && data.id !== "") {
    return { ok: true, jobId: data.id, path: jobPath(data.id) };
  }
  return { ok: false, message: failedToChangeDocument(response?.status) };
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
