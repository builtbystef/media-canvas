import type { JobView } from "@media-canvas/api-client";
import type { VariableDecl } from "@media-canvas/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { jobPath } from "./routes.ts";
import { mapHeaders, prepareBatch, submitBatch, type HeaderMapping } from "./batch.ts";

const TITLE: VariableDecl = { name: "title", type: "text" };
const PRICE: VariableDecl = { name: "price", type: "number", default: 0 };
const ACCENT: VariableDecl = { name: "accent", type: "color", default: "#FFFFFF" };

const WORKED: HeaderMapping = {
  matched: ["title", "price"],
  missingDefaulted: ["accent"],
  missingRequired: [],
  unknown: [],
  nameColumn: true,
};

test("headers title,price,_name map onto title and price, default accent, and the name column", () => {
  // Worked example: title required, price number default 0, accent color with
  // a default. The name column is recognized and is not a Variable.
  expect(mapHeaders(["title", "price", "_name"], [TITLE, PRICE, ACCENT])).toEqual(WORKED);
});

test("an extra notes header is an unknown column", () => {
  expect(mapHeaders(["title", "price", "_name", "notes"], [TITLE, PRICE, ACCENT])).toEqual({
    ...WORKED,
    unknown: ["notes"],
  });
});

test("removing the title header leaves title missing and required", () => {
  expect(mapHeaders(["price", "_name"], [TITLE, PRICE, ACCENT])).toEqual({
    matched: ["price"],
    missingDefaulted: ["accent"],
    missingRequired: ["title"],
    unknown: [],
    nameColumn: true,
  });
});

test("a quoted newline stays one cell, so the preview's rows match a real CSV parse", () => {
  const csv = 'title,blurb\n"Sale","line 1\nline 2"\n';
  const prepared = prepareBatch(csv, { mintKey: () => "K" });
  expect(prepared.headers).toEqual(["title", "blurb"]);
  expect(prepared.rows).toEqual([["Sale", "line 1\nline 2"]]);
});

test("the summary never reads a cell, so a badly typed price does not change the mapping", () => {
  const csv = "title,price,_name\nSale,not-a-number,hero\n";
  const prepared = prepareBatch(csv, { mintKey: () => "K" });

  expect(prepared.headers).toEqual(["title", "price", "_name"]);
  expect(prepared.rows).toEqual([["Sale", "not-a-number", "hero"]]);
  expect(mapHeaders(prepared.headers, [TITLE, PRICE, ACCENT])).toEqual(WORKED);
});

test("a missing-required Variable and an unknown column still leave submission available", async () => {
  // Shape warnings are not a gate. The file goes as it is; the server refuses.
  const csv = "notes,price\nkeep,1\n";
  const prepared = prepareBatch(csv, { mintKey: () => "K" });
  const mapping = mapHeaders(prepared.headers, [TITLE, PRICE, ACCENT]);
  expect(mapping.missingRequired).toEqual(["title"]);
  expect(mapping.unknown).toEqual(["notes"]);

  let sent: { body: unknown; query: unknown; headers: unknown } | undefined;
  const result = await submitBatch(
    {
      templateId: "tpl-1",
      bytes: prepared.bytes,
      format: { format: "png", scale: 1 },
      idempotencyKey: prepared.idempotencyKey,
    },
    async (options) => {
      sent = { body: options.body, query: options.query, headers: options.headers };
      return { data: aJob("job-1"), error: undefined, response: { status: 201 } };
    },
  );

  expect(sent?.body).toBe(csv);
  expect(result).toEqual({ ok: true, jobId: "job-1", path: jobPath("job-1") });
});

test("a key is minted on parse, reused on retry, and rotated on re-parse", async () => {
  const csv = "title\nSale\n";
  const keys = ["K", "K2"];
  const mintKey = () => {
    const next = keys.shift();
    if (next === undefined) throw new Error("no further key was supposed to be minted");
    return next;
  };

  const prepared = prepareBatch(csv, { mintKey });
  expect(prepared.idempotencyKey).toBe("K");

  const failed = await submitBatch(
    {
      templateId: "tpl-1",
      bytes: prepared.bytes,
      format: { format: "png", scale: 1 },
      idempotencyKey: prepared.idempotencyKey,
    },
    async () => ({ data: undefined, error: {}, response: undefined }),
  );
  expect(failed.ok).toBe(false);

  let retryKey: string | undefined;
  await submitBatch(
    {
      templateId: "tpl-1",
      bytes: prepared.bytes,
      format: { format: "png", scale: 1 },
      idempotencyKey: prepared.idempotencyKey,
    },
    async (options) => {
      retryKey = options.query?.idempotencyKey;
      return { data: aJob("job-1"), error: undefined, response: { status: 201 } };
    },
  );
  expect(retryKey).toBe("K");

  const pickedAgain = prepareBatch(csv, { mintKey });
  expect(pickedAgain.idempotencyKey).toBe("K2");
});

test("submitting sends the file's own bytes as CSV, with format and key as query parameters", async () => {
  const csv = "title,price\nSale,4.99\n";
  const prepared = prepareBatch(csv, { mintKey: () => "K" });
  let sent:
    | {
        path: { templateId: string };
        body: string;
        query: { format: string; scale?: number; idempotencyKey?: string };
        headers: { "Content-Type": string };
      }
    | undefined;

  await submitBatch(
    {
      templateId: "tpl-1",
      bytes: prepared.bytes,
      format: { format: "png", scale: 2 },
      idempotencyKey: prepared.idempotencyKey,
    },
    async (options) => {
      sent = options;
      return { data: aJob("job-9"), error: undefined, response: { status: 201 } };
    },
  );

  expect(sent?.path).toEqual({ templateId: "tpl-1" });
  expect(sent?.body).toBe(csv);
  expect(sent?.body).not.toEqual(expect.any(Array));
  expect(sent?.query).toEqual({ format: "png", scale: 2, idempotencyKey: "K" });
  expect(sent?.headers).toMatchObject({ "Content-Type": "text/csv" });
});

test("an accepted job and an already-existing job both open that job's page", async () => {
  const csv = "title\nSale\n";
  const prepared = prepareBatch(csv, { mintKey: () => "K" });
  const request = {
    templateId: "tpl-1",
    bytes: prepared.bytes,
    format: { format: "pdf" } as const,
    idempotencyKey: prepared.idempotencyKey,
  };

  const created = await submitBatch(request, async () => ({
    data: aJob("job-new"),
    error: undefined,
    response: { status: 201 },
  }));
  const replayed = await submitBatch(request, async () => ({
    data: aJob("job-new"),
    error: undefined,
    response: { status: 200 },
  }));

  expect(created).toEqual({ ok: true, jobId: "job-new", path: jobPath("job-new") });
  expect(replayed).toEqual({ ok: true, jobId: "job-new", path: jobPath("job-new") });
});

test("the CSV parser named in the spec is the only dependency this slice adds", () => {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  expect(pkg.dependencies.papaparse).toMatch(/^(?:\d|\^|~)/);
  expect(pkg.dependencies.papaparse).not.toMatch(/^file:/);
});

function aJob(id: string): JobView {
  return {
    id,
    templateId: "tpl-1",
    state: "queued",
    output: { format: "png", scale: 1 },
    createdAt: "2026-01-01T00:00:00Z",
    progress: { queued: 1, rendering: 0, succeeded: 0, failed: 0, skipped: 0 },
    rows: [],
  };
}
