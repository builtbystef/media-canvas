import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { DesignDocument, ImageElement } from "@media-canvas/core";
import { afterEach, expect, test } from "vitest";

import { AssetFetchError } from "./asset-source.ts";
import { writePng } from "./goldens/png.ts";
import type { OutputStore } from "./outputs.ts";
import { PAGE_POOL_SIZE, type PagePool } from "./page-pool.ts";
import { ValueRefusal } from "./render-document.ts";
import { createRowConsumer } from "./row-consumer.ts";
import { ROW_CONCURRENCY } from "./row-queue.ts";

const TOKEN = "internal-token-for-tests";
const WORKSPACE = "workspace-1";
const JOB = "job-1";
const ROW = "row-1";

let running: { close: () => Promise<void> } | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

test("a one-Row png Job named hero stores the file under the Job prefix and reports that key", async () => {
  const file = new Uint8Array([1, 2, 3, 4]);
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows: {
          [ROW]: { values: {}, name: "hero", rowIndex: 0 },
        },
      },
    },
  });
  const outputs = memoryOutputs();
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: recordingPool(file),
    outputs,
  });

  await consumer.process({ jobId: JOB, rowId: ROW, attempt: 1, maxAttempts: 2 });

  const key = `${WORKSPACE}/jobs/${JOB}/hero.png`;
  expect(outputs.objects.get(key)?.body).toEqual(file);
  expect(outputs.objects.get(key)?.contentType).toBe("image/png");
  expect(api.results).toEqual([
    { jobId: JOB, rowId: ROW, body: { status: "succeeded", outputKey: key } },
  ]);
});

test("the Job snapshot is fetched once and reused across that Job's Rows", async () => {
  const file = new Uint8Array([9]);
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows: {
          a: { values: {}, name: "a", rowIndex: 0 },
          b: { values: {}, name: "b", rowIndex: 1 },
        },
      },
    },
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: recordingPool(file),
    outputs: memoryOutputs(),
  });

  await Promise.all([
    consumer.process({ jobId: JOB, rowId: "a", attempt: 1, maxAttempts: 2 }),
    consumer.process({ jobId: JOB, rowId: "b", attempt: 1, maxAttempts: 2 }),
  ]);

  expect(api.jobHits).toEqual([JOB]);
  expect(api.results).toHaveLength(2);
});

test("a transient image fetch is retried once and the Row succeeds on the second attempt", async () => {
  const file = new Uint8Array([7]);
  const photo = solidPng(32, 32, 200, 0, 0);
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate([imageElement("held")]),
        output: { format: "png", scale: 1 },
        rows: {
          [ROW]: { values: {}, name: "hero", rowIndex: 0 },
        },
      },
    },
    assets: { held: { bytes: photo, type: "image/png" } },
    failAssetTimes: 1,
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: recordingPool(file),
    outputs: memoryOutputs(),
  });
  const task = { jobId: JOB, rowId: ROW, attempt: 1, maxAttempts: 2 };

  await expect(consumer.process(task)).rejects.toBeInstanceOf(AssetFetchError);
  expect(api.results).toEqual([]);
  expect(api.assetHits).toBe(1);

  await consumer.process({ ...task, attempt: 2 });

  expect(api.assetHits).toBe(2);
  expect(api.results).toEqual([
    {
      jobId: JOB,
      rowId: ROW,
      body: { status: "succeeded", outputKey: `${WORKSPACE}/jobs/${JOB}/hero.png` },
    },
  ]);
});

test("a transient failure that fails twice is reported failed after the second attempt", async () => {
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate([imageElement("held")]),
        output: { format: "png", scale: 1 },
        rows: {
          [ROW]: { values: {}, name: "hero", rowIndex: 0 },
        },
      },
    },
    assets: {},
    failAssetTimes: 2,
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: unusedPool(),
    outputs: memoryOutputs(),
  });
  const task = { jobId: JOB, rowId: ROW, attempt: 1, maxAttempts: 2 };

  await expect(consumer.process(task)).rejects.toBeInstanceOf(AssetFetchError);
  expect(api.results).toEqual([]);

  await expect(consumer.process({ ...task, attempt: 2 })).rejects.toBeInstanceOf(AssetFetchError);
  expect(api.results).toEqual([
    {
      jobId: JOB,
      rowId: ROW,
      body: {
        status: "failed",
        error: { message: 'the asset "held" was not found' },
      },
    },
  ]);
});

test("a failure caused by the Row's values is reported failed immediately and is not retried", async () => {
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows: {
          [ROW]: { values: { extra: "nope" }, name: "hero", rowIndex: 0 },
        },
      },
    },
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: unusedPool(),
    outputs: memoryOutputs(),
  });

  await expect(
    consumer.process({ jobId: JOB, rowId: ROW, attempt: 1, maxAttempts: 2 }),
  ).rejects.toBeInstanceOf(ValueRefusal);

  expect(api.results).toEqual([
    {
      jobId: JOB,
      rowId: ROW,
      body: {
        status: "failed",
        error: { variable: "extra", message: 'the Variable "extra" is not declared' },
      },
    },
  ]);
});

test("a Row that fails leaves the Job's other Rows untouched", async () => {
  const file = new Uint8Array([5]);
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows: {
          bad: { values: { extra: "nope" }, name: "bad", rowIndex: 0 },
          good: { values: {}, name: "good", rowIndex: 1 },
        },
      },
    },
  });
  const outputs = memoryOutputs();
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: recordingPool(file),
    outputs,
  });

  const failed = consumer.process({
    jobId: JOB,
    rowId: "bad",
    attempt: 1,
    maxAttempts: 2,
  });
  const succeeded = consumer.process({
    jobId: JOB,
    rowId: "good",
    attempt: 1,
    maxAttempts: 2,
  });

  await expect(failed).rejects.toBeInstanceOf(ValueRefusal);
  await succeeded;

  expect(outputs.objects.has(`${WORKSPACE}/jobs/${JOB}/good.png`)).toBe(true);
  expect(outputs.objects.has(`${WORKSPACE}/jobs/${JOB}/bad.png`)).toBe(false);
  const statuses = api.results.map((result) => (result.body as { status: string }).status).sort();
  expect(statuses).toEqual(["failed", "succeeded"]);
});

test("a 404 from the result report completes the task without retry", async () => {
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows: {
          [ROW]: { values: {}, name: "hero", rowIndex: 0 },
        },
      },
    },
    resultStatus: 404,
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool: recordingPool(new Uint8Array([1])),
    outputs: memoryOutputs(),
  });

  await consumer.process({ jobId: JOB, rowId: ROW, attempt: 1, maxAttempts: 2 });

  expect(api.results).toHaveLength(1);
});

test("eight Rows render concurrently through the one page pool", async () => {
  expect(PAGE_POOL_SIZE).toBe(8);
  expect(ROW_CONCURRENCY).toBe(PAGE_POOL_SIZE);
  let inFlight = 0;
  let maxInFlight = 0;
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const pool: PagePool = {
    opened: 0,
    async render() {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight === 8) entered.resolve();
      await gate;
      inFlight -= 1;
      return new Uint8Array([1]);
    },
    async close() {},
  };
  const rows: Record<string, FakeRow> = {};
  for (let index = 0; index < 8; index++) {
    rows[`row-${String(index)}`] = {
      values: {},
      name: `row-${String(index)}`,
      rowIndex: index,
    };
  }
  const api = await standInApi({
    jobs: {
      [JOB]: {
        workspaceId: WORKSPACE,
        templateSnapshot: blankTemplate(),
        output: { format: "png", scale: 1 },
        rows,
      },
    },
  });
  const consumer = createRowConsumer({
    apiBaseUrl: api.url,
    token: TOKEN,
    pool,
    outputs: memoryOutputs(),
  });

  const runningRows = Object.keys(rows).map((rowId) =>
    consumer.process({ jobId: JOB, rowId, attempt: 1, maxAttempts: 2 }),
  );
  await entered.promise;
  expect(maxInFlight).toBe(8);
  release();
  await Promise.all(runningRows);
  expect(api.results).toHaveLength(8);
});

function blankTemplate(elements: DesignDocument["elements"] = []): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 64, height: 64, background: "#FFFFFF" },
    elements:
      elements.length > 0
        ? elements
        : [
            {
              id: "box",
              type: "rect",
              x: 0,
              y: 0,
              width: 64,
              height: 64,
              rotation: 0,
              opacity: 1,
              visible: true,
              fill: "#CC0000",
            },
          ],
  };
}

function imageElement(src: string): ImageElement {
  return {
    id: "photo",
    type: "image",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    rotation: 0,
    opacity: 1,
    visible: true,
    src,
    naturalWidth: 32,
    naturalHeight: 32,
    fitMode: "stretch",
    clip: "none",
  };
}

function unusedPool(): PagePool {
  return {
    opened: 0,
    async render() {
      throw new Error("opened a page");
    },
    async close() {},
  };
}

function solidPng(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const at = i * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = 255;
  }
  return writePng(width, height, data);
}

function recordingPool(bytes: Uint8Array): PagePool {
  return {
    opened: 0,
    async render() {
      return bytes;
    },
    async close() {},
  };
}

function memoryOutputs(): OutputStore & {
  objects: Map<string, { body: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
  };
}

type FakeRow = { values: Record<string, unknown>; name: string; rowIndex: number };
type FakeJob = {
  workspaceId: string;
  templateSnapshot: DesignDocument;
  output: { format: "png"; scale: 1 } | { format: "jpeg"; quality?: number } | { format: "pdf" };
  rows: Record<string, FakeRow>;
};

type FakeApi = {
  url: string;
  results: Array<{ jobId: string; rowId: string; body: unknown }>;
  jobHits: string[];
  assetHits: number;
};

async function standInApi(options: {
  jobs: Record<string, FakeJob>;
  assets?: Record<string, { bytes: Uint8Array; type: string }>;
  failAssetTimes?: number;
  resultStatus?: number;
}): Promise<FakeApi> {
  const results: FakeApi["results"] = [];
  const jobHits: string[] = [];
  let assetHits = 0;
  let assetFailuresLeft = options.failAssetTimes ?? 0;
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  running = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    results,
    jobHits,
    get assetHits() {
      return assetHits;
    },
  };

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401);
      response.end();
      return;
    }
    const url = request.url ?? "";
    const jobMatch = /^\/internal\/jobs\/([^/]+)$/.exec(url);
    if (request.method === "GET" && jobMatch !== null) {
      const jobId = jobMatch[1] ?? "";
      jobHits.push(jobId);
      const job = options.jobs[jobId];
      if (job === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      send(response, 200, {
        workspaceId: job.workspaceId,
        templateSnapshot: job.templateSnapshot,
        output: job.output,
      });
      return;
    }
    const rowMatch = /^\/internal\/jobs\/([^/]+)\/rows\/([^/]+)$/.exec(url);
    if (request.method === "GET" && rowMatch !== null) {
      const job = options.jobs[rowMatch[1] ?? ""];
      const row = job?.rows[rowMatch[2] ?? ""];
      if (row === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      send(response, 200, { values: row.values, name: row.name, rowIndex: row.rowIndex });
      return;
    }
    const resultMatch = /^\/internal\/jobs\/([^/]+)\/rows\/([^/]+)\/result$/.exec(url);
    if (request.method === "POST" && resultMatch !== null) {
      const body = await readJson(request);
      results.push({ jobId: resultMatch[1] ?? "", rowId: resultMatch[2] ?? "", body });
      response.writeHead(options.resultStatus ?? 204);
      response.end();
      return;
    }
    const assetMatch = /^\/internal\/workspaces\/[^/]+\/assets\/([^/?]+)$/.exec(url);
    if (request.method === "GET" && assetMatch !== null) {
      assetHits += 1;
      if (assetFailuresLeft > 0) {
        assetFailuresLeft -= 1;
        response.writeHead(404);
        response.end();
        return;
      }
      const asset = options.assets?.[assetMatch[1] ?? ""];
      if (asset === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": asset.type,
        "content-length": String(asset.bytes.byteLength),
      });
      response.end(Buffer.from(asset.bytes));
      return;
    }
    response.writeHead(404);
    response.end();
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(payload)),
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += (chunk as Buffer).toString("utf8");
  return JSON.parse(body);
}
