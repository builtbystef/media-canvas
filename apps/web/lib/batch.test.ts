import type { JobView } from "@media-canvas/api-client";
import type { VariableDecl } from "@media-canvas/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { jobPath } from "./routes.ts";
import {
  mapHeaders,
  mergeRefusal,
  prepareBatch,
  submitBatch,
  type HeaderMapping,
} from "./batch.ts";

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

test("a 422 for row index 3 on price marks the fourth data row and counts one invalid row", () => {
  // Worked example: row indexes count data rows from zero; the header does not
  // shift them. The preview stays; the overlay names the Variable.
  const prepared = prepareBatch("title,price,_name\nA,1,a\nB,2,b\nC,3,c\nD,bad,d\n", {
    mintKey: () => "K",
  });
  const overlay = mergeRefusal(prepared, {
    errors: [{ rowIndex: 3, variable: "price", message: "must be a number" }],
  });

  expect(prepared.rows).toHaveLength(4);
  expect(prepared.rows[3]).toEqual(["D", "bad", "d"]);
  expect(overlay.messagesByRow.get(3)).toEqual(["price: must be a number"]);
  expect(overlay.messagesByRow.get(0)).toBeUndefined();
  expect(overlay.countLine).toBe("1 row invalid; nothing was submitted");
  expect(overlay.firstRowIndex).toBe(3);
  expect(overlay.groups).toEqual([
    { rowIndex: 3, name: "d", messages: ["price: must be a number"] },
  ]);
});

test("14 offending rows and two errors on one row count distinct rows, not errors", () => {
  const fourteen = Array.from({ length: 14 }, (_, rowIndex) => ({
    rowIndex,
    variable: "price",
    message: "must be a number",
  }));
  expect(
    mergeRefusal(prepareBatch(csvRows(14), { mintKey: () => "K" }), { errors: fourteen }).countLine,
  ).toBe("14 rows invalid; nothing was submitted");

  const twoOnOne = [
    { rowIndex: 2, variable: "price", message: "must be a number" },
    { rowIndex: 2, variable: "title", message: "is required" },
  ];
  const overlay = mergeRefusal(prepareBatch(csvRows(4), { mintKey: () => "K" }), {
    errors: twoOnOne,
  });
  expect(overlay.countLine).toBe("1 row invalid; nothing was submitted");
  expect(overlay.groups).toEqual([
    {
      rowIndex: 2,
      name: "row-2",
      messages: ["price: must be a number", "title: is required"],
    },
  ]);
});

test("a refusal merges onto the preview and does not replace its rows or headers", () => {
  const prepared = prepareBatch(csvRows(4), { mintKey: () => "K" });
  const headers = [...prepared.headers];
  const rows = prepared.rows.map((row) => [...row]);

  mergeRefusal(prepared, {
    errors: [{ rowIndex: 1, variable: "price", message: "must be a number" }],
  });

  expect(prepared.headers).toEqual(headers);
  expect(prepared.rows).toEqual(rows);
});

test("groups name a row from _name when the file supplied one, and omit it otherwise", () => {
  const named = mergeRefusal(prepareBatch(csvRows(3), { mintKey: () => "K" }), {
    errors: [{ rowIndex: 1, variable: "price", message: "must be a number" }],
  });
  expect(named.groups[0]).toMatchObject({ rowIndex: 1, name: "row-1" });

  const unnamed = mergeRefusal(prepareBatch("title,price\nA,1\nB,bad\n", { mintKey: () => "K" }), {
    errors: [{ rowIndex: 1, variable: "price", message: "must be a number" }],
  });
  expect(unnamed.groups[0]).toMatchObject({ rowIndex: 1, name: null });
});

test("a 422 refusal body is returned so it can merge into the open preview", async () => {
  const csv = csvRows(4);
  const prepared = prepareBatch(csv, { mintKey: () => "K" });
  const body = {
    errors: [{ rowIndex: 3, variable: "price", message: "must be a number" }],
    templateErrors: [],
  };

  const result = await submitBatch(
    {
      templateId: "tpl-1",
      bytes: prepared.bytes,
      format: { format: "png", scale: 1 },
      idempotencyKey: prepared.idempotencyKey,
    },
    async () => ({ data: undefined, error: body, response: { status: 422 } }),
  );

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.refusal).toEqual(body);
  expect(mergeRefusal(prepared, result.refusal ?? { errors: [] }).countLine).toBe(
    "1 row invalid; nothing was submitted",
  );
});

function csvRows(count: number): string {
  const lines = ["title,price,_name"];
  for (let index = 0; index < count; index += 1) {
    lines.push(`t${String(index)},${String(index)},row-${String(index)}`);
  }
  return `${lines.join("\n")}\n`;
}

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
