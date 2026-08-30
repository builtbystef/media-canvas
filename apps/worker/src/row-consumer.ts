import type { DesignDocument, ValidationError } from "@media-canvas/core";

import type { OutputStore } from "./outputs.ts";
import type { PagePool } from "./page-pool.ts";
import { renderDocument, ValueRefusal } from "./render-document.ts";
import type { RenderOptions } from "./render.ts";

export type RowTask = {
  jobId: string;
  rowId: string;
  attempt: number;
  maxAttempts: number;
};

export type RowConsumer = {
  process(task: RowTask): Promise<void>;
};

export type RowConsumerOptions = {
  apiBaseUrl: string;
  token: string;
  pool: PagePool;
  outputs: OutputStore;
};

type JobBundle = {
  workspaceId: string;
  templateSnapshot: DesignDocument;
  output: RenderOptions;
};

type RowBundle = {
  values: Record<string, unknown>;
  name: string;
  rowIndex: number;
};

class Gone extends Error {}

export function createRowConsumer(options: RowConsumerOptions): RowConsumer {
  const origin = options.apiBaseUrl.replace(/\/$/, "");
  const jobs = new Map<string, Promise<JobBundle>>();

  function loadJob(jobId: string): Promise<JobBundle> {
    const existing = jobs.get(jobId);
    if (existing !== undefined) return existing;
    const pending = fetchJob(origin, options.token, jobId).catch((failure: unknown) => {
      jobs.delete(jobId);
      throw failure;
    });
    jobs.set(jobId, pending);
    return pending;
  }

  async function run(task: RowTask): Promise<void> {
    const job = await loadJob(task.jobId);
    const row = await fetchRow(origin, options.token, task.jobId, task.rowId);
    try {
      const bytes = await renderDocument({
        workspaceId: job.workspaceId,
        template: job.templateSnapshot,
        values: row.values,
        output: job.output,
        pool: options.pool,
        apiBaseUrl: origin,
        token: options.token,
      });
      const key = outputKey(job.workspaceId, task.jobId, row.name, job.output.format);
      await options.outputs.put(key, bytes, contentType(job.output));
      await report(origin, options.token, task, { status: "succeeded", outputKey: key });
    } catch (failure) {
      if (failure instanceof Gone) throw failure;
      if (failure instanceof ValueRefusal) {
        await reportFailed(origin, options.token, task, namedError(failure.errors[0]));
        throw failure;
      }
      if (task.attempt >= task.maxAttempts) {
        await reportFailed(origin, options.token, task, {
          message: failure instanceof Error ? failure.message : String(failure),
        });
      }
      throw failure;
    }
  }

  return {
    async process(task) {
      try {
        await run(task);
      } catch (failure) {
        if (failure instanceof Gone) return;
        throw failure;
      }
    },
  };
}

function outputKey(workspaceId: string, jobId: string, name: string, format: string): string {
  return `${workspaceId}/jobs/${jobId}/${name}.${format}`;
}

function contentType(output: RenderOptions): string {
  if (output.format === "png") return "image/png";
  if (output.format === "jpeg") return "image/jpeg";
  return "application/pdf";
}

function namedError(error: ValidationError | undefined): { variable?: string; message: string } {
  if (error === undefined) return { message: "the values are not valid for this Template" };
  return error.variable === undefined
    ? { message: error.message }
    : { variable: error.variable, message: error.message };
}

async function fetchJob(origin: string, token: string, jobId: string): Promise<JobBundle> {
  const body = await getJson(`${origin}/internal/jobs/${jobId}`, token);
  if (typeof body !== "object" || body === null) {
    throw new Error("the Job call did not return a Job");
  }
  const { workspaceId, templateSnapshot, output } = body as Record<string, unknown>;
  if (typeof workspaceId !== "string" || workspaceId === "") {
    throw new Error("the Job call did not return a Workspace");
  }
  const parsed = asOutput(output);
  if (parsed === undefined) throw new Error("the Job call did not return an output format");
  return {
    workspaceId,
    templateSnapshot: templateSnapshot as DesignDocument,
    output: parsed,
  };
}

async function fetchRow(
  origin: string,
  token: string,
  jobId: string,
  rowId: string,
): Promise<RowBundle> {
  const body = await getJson(`${origin}/internal/jobs/${jobId}/rows/${rowId}`, token);
  if (typeof body !== "object" || body === null) {
    throw new Error("the Row call did not return a Row");
  }
  const { values, name, rowIndex } = body as Record<string, unknown>;
  if (typeof name !== "string" || name === "") {
    throw new Error("the Row call did not return a name");
  }
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new Error("the Row call did not return values");
  }
  if (typeof rowIndex !== "number") throw new Error("the Row call did not return a rowIndex");
  return { values: values as Record<string, unknown>, name, rowIndex };
}

async function reportFailed(
  origin: string,
  token: string,
  task: RowTask,
  error: { variable?: string; message: string },
): Promise<void> {
  await report(origin, token, task, { status: "failed", error });
}

async function report(
  origin: string,
  token: string,
  task: RowTask,
  body: { status: "succeeded"; outputKey: string } | { status: "failed"; error: unknown },
): Promise<void> {
  const response = await fetch(`${origin}/internal/jobs/${task.jobId}/rows/${task.rowId}/result`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.status === 404) throw new Gone();
  if (!response.ok) {
    throw new Error(`the result report failed: HTTP ${String(response.status)}`);
  }
}

async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 404) throw new Gone();
  if (!response.ok) {
    throw new Error(`the internal api answered HTTP ${String(response.status)}`);
  }
  return response.json();
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
