import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { DesignDocument, FontInspection, ValidationError } from "@media-canvas/core";
import { inspectFont, typeCells, validate, validateDocument } from "@media-canvas/core";

import type { PagePool } from "./page-pool.ts";
import { AssetFetchError, renderDocument, renderErrors, ValueRefusal } from "./render-document.ts";
import type { RenderOptions } from "./render.ts";

export type InternalServiceOptions = {
  token: string;
  pool?: PagePool;
  apiBaseUrl?: string;
};

export const DEFAULT_INTERNAL_PORT = 4000;

export const DEFAULT_API_INTERNAL_URL = "http://localhost:8000";

export class InternalServiceConfigError extends Error {}

export function internalServiceConfig(env: Record<string, string | undefined>): {
  token: string;
  port: number;
  apiBaseUrl: string;
} {
  const token = env.INTERNAL_API_TOKEN;
  if (token === undefined || token === "") {
    throw new InternalServiceConfigError(
      "INTERNAL_API_TOKEN: the credential the api and the worker share is required. " +
        "Copy .env.example to .env and fill in the values it marks required.",
    );
  }
  const declared = env.WORKER_INTERNAL_PORT;
  let port = DEFAULT_INTERNAL_PORT;
  if (declared !== undefined && declared !== "") {
    port = Number(declared);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new InternalServiceConfigError(
        `WORKER_INTERNAL_PORT: "${declared}" is not a port number.`,
      );
    }
  }
  const origin = env.API_INTERNAL_URL;
  const apiBaseUrl =
    origin === undefined || origin === "" ? DEFAULT_API_INTERNAL_URL : origin.replace(/\/$/, "");
  try {
    new URL(apiBaseUrl);
  } catch {
    throw new InternalServiceConfigError(`API_INTERNAL_URL: "${apiBaseUrl}" is not a URL.`);
  }
  return { token, port, apiBaseUrl };
}

export function explainListenFailure(failure: unknown, port: number): string | undefined {
  if ((failure as NodeJS.ErrnoException | null)?.code !== "EADDRINUSE") return undefined;
  return (
    `WORKER_INTERNAL_PORT: port ${String(port)} is already in use — ` +
    "stop what is holding it, or name another port."
  );
}

export type RowError = ValidationError & { rowIndex: number };

export type ValidateRequest = {
  workspaceId: string;
  template: DesignDocument;
  rows: Record<string, unknown>[];
  cells?: true;
};

export type ValidateResponse = {
  errors: RowError[];
  templateErrors: ValidationError[];
  rows?: Record<string, unknown>[];
};

export function createInternalService(options: InternalServiceOptions): Server {
  return createServer((request, response) => {
    if (!isAuthorized(request, options.token)) {
      send(response, 401, { message: "the shared internal credential is required" });
      return;
    }
    if (request.method === "POST" && request.url === "/validate") {
      void handleValidate(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/fonts/inspect") {
      void handleInspectFont(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/render") {
      void handleRender(request, response, options);
      return;
    }
    send(response, 404, { message: "no such internal call" });
  });
}

export type RenderRequest = {
  workspaceId: string;
  template: DesignDocument;
  values: Record<string, unknown>;
  output: RenderOptions;
};

async function handleRender(
  request: IncomingMessage,
  response: ServerResponse,
  options: InternalServiceOptions,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    send(response, 400, { message: "the request body must be JSON" });
    return;
  }
  const payload = asRenderRequest(body);
  if (payload === undefined) {
    send(response, 400, {
      message:
        "the request body must carry a workspaceId, a template, values, and an output format",
    });
    return;
  }
  const errors = renderErrors(payload.template, payload.values);
  if (errors.length > 0) {
    send(response, 422, { errors });
    return;
  }
  if (options.pool === undefined) {
    send(response, 500, { message: "the worker has no page pool" });
    return;
  }
  try {
    const bytes = await renderDocument({
      ...payload,
      pool: options.pool,
      token: options.token,
      ...(options.apiBaseUrl === undefined ? {} : { apiBaseUrl: options.apiBaseUrl }),
    });
    sendBytes(response, 200, contentType(payload.output), bytes);
  } catch (failure) {
    if (failure instanceof ValueRefusal) {
      send(response, 422, { errors: failure.errors });
      return;
    }
    if (failure instanceof AssetFetchError) {
      send(response, 502, { error: { assetId: failure.assetId, message: failure.message } });
      return;
    }
    send(response, 500, { message: `render failed: ${String(failure)}` });
  }
}

function asRenderRequest(body: unknown): RenderRequest | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { workspaceId, template, values, output } = body as Record<string, unknown>;
  if (typeof workspaceId !== "string" || workspaceId === "") return undefined;
  if (typeof values !== "object" || values === null || Array.isArray(values)) return undefined;
  const parsed = asOutput(output);
  if (parsed === undefined) return undefined;
  return {
    workspaceId,
    template: template as DesignDocument,
    values: values as Record<string, unknown>,
    output: parsed,
  };
}

function asOutput(value: unknown): RenderOptions | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { format, scale, quality } = value as Record<string, unknown>;
  if (format === "png" && (scale === 1 || scale === 2 || scale === 3)) {
    return { format, scale };
  }
  if (format === "jpeg") {
    if (quality === undefined) return { format };
    if (
      typeof quality === "number" &&
      Number.isInteger(quality) &&
      quality >= 0 &&
      quality <= 100
    ) {
      return { format, quality };
    }
    return undefined;
  }
  if (format === "pdf") return { format };
  return undefined;
}

async function handleValidate(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    send(response, 400, { message: "the request body must be JSON" });
    return;
  }
  const payload = asValidateRequest(body);
  if (payload === undefined) {
    send(response, 400, {
      message: "the request body must carry a workspaceId, a template, and an array of rows",
    });
    return;
  }
  try {
    send(response, 200, validateBatch(payload));
  } catch (failure) {
    send(response, 500, { message: `validation failed: ${String(failure)}` });
  }
}

async function handleInspectFont(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const bytes = await readBytes(request);
  let inspection: FontInspection;
  try {
    inspection = inspectFont(bytes);
  } catch (failure) {
    send(response, 500, { message: `font inspection failed: ${String(failure)}` });
    return;
  }
  send(response, 200, inspection);
}

export function validateBatch(payload: ValidateRequest): ValidateResponse {
  const templateErrors = validateDocument(payload.template);
  if (templateErrors.length > 0) return { errors: [], templateErrors };

  const errors: RowError[] = [];
  const typedRows: Record<string, unknown>[] = [];
  payload.rows.forEach((row, rowIndex) => {
    const { values, errors: cellErrors } = payload.cells
      ? typeCells(payload.template, row as Record<string, string>)
      : { values: row, errors: [] };
    typedRows.push(values);
    const reported = new Set(cellErrors.map((error) => error.variable));
    const rowErrors = [
      ...cellErrors,
      ...validate(payload.template, values).filter((error) => !reported.has(error.variable)),
    ];
    for (const error of rowErrors) errors.push({ ...error, rowIndex });
  });
  return { errors, templateErrors: [], ...(payload.cells ? { rows: typedRows } : {}) };
}

function asValidateRequest(body: unknown): ValidateRequest | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { workspaceId, template, rows, cells } = body as Record<string, unknown>;
  if (typeof workspaceId !== "string" || workspaceId === "") return undefined;
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== "object" || row === null)) {
    return undefined;
  }
  if (cells !== undefined && cells !== true) return undefined;
  return {
    workspaceId,
    template: template as DesignDocument,
    rows: rows as Record<string, unknown>[],
    ...(cells === true ? { cells } : {}),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += (chunk as Buffer).toString("utf8");
  return JSON.parse(body);
}

async function readBytes(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const presentedBytes = Buffer.from(presented);
  const tokenBytes = Buffer.from(token);
  if (presentedBytes.length !== tokenBytes.length) return false;
  return timingSafeEqual(presentedBytes, tokenBytes);
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
  });
  response.end(payload);
}

function sendBytes(
  response: ServerResponse,
  status: number,
  type: string,
  bytes: Uint8Array,
): void {
  response.writeHead(status, {
    "content-type": type,
    "content-length": String(bytes.byteLength),
  });
  response.end(Buffer.from(bytes));
}

function contentType(output: RenderOptions): string {
  if (output.format === "png") return "image/png";
  if (output.format === "jpeg") return "image/jpeg";
  return "application/pdf";
}
