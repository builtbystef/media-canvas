import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { explainListenFailure } from "./internal-service.ts";

const entry = join(import.meta.dirname, "index.ts");

const storage = {
  GARAGE_DEFAULT_ACCESS_KEY: "gk",
  GARAGE_DEFAULT_SECRET_KEY: "garage-secret-key",
};

let occupied: { close: () => Promise<void> } | undefined;

afterEach(async () => {
  await occupied?.close();
  occupied = undefined;
});

/** Start the worker the way `pnpm dev` and the image both start it — as its
 *  own process — and wait for it to fail. */
async function startWorker(env: Record<string, string>): Promise<{
  code: number | null;
  stderr: string;
}> {
  const worker = spawn(process.execPath, [entry], {
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  let stderr = "";
  worker.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => {
    worker.on("exit", resolve);
  });
  return { code, stderr };
}

/** A port this machine has already given to something else. */
async function takenPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  occupied = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  return (server.address() as AddressInfo).port;
}

test("a port already in use fails naming the variable that names the port", async () => {
  const port = await takenPort();

  const { code, stderr } = await startWorker({
    INTERNAL_API_TOKEN: "a-shared-secret",
    WORKER_INTERNAL_PORT: String(port),
    ...storage,
  });

  expect(code).not.toBe(0);
  expect(stderr).toContain("WORKER_INTERNAL_PORT");
  expect(stderr).toContain(String(port));
});

test("that failure is a sentence, not a stack trace", async () => {
  const port = await takenPort();

  const { stderr } = await startWorker({
    INTERNAL_API_TOKEN: "a-shared-secret",
    WORKER_INTERNAL_PORT: String(port),
    ...storage,
  });

  expect(stderr).not.toContain("    at ");
  expect(stderr.trim().split("\n")).toHaveLength(1);
});

test("a listen failure we cannot name is not paraphrased, so its stack survives", () => {
  const denied = Object.assign(new Error("listen EACCES: permission denied"), { code: "EACCES" });

  expect(explainListenFailure(denied, 1)).toBeUndefined();
  expect(explainListenFailure(new Error("something else entirely"), 4000)).toBeUndefined();
});

test("a missing credential is told the same way: one sentence, no stack trace", async () => {
  const { code, stderr } = await startWorker({});

  expect(code).not.toBe(0);
  expect(stderr).toContain("INTERNAL_API_TOKEN");
  expect(stderr).not.toContain("    at ");
  expect(stderr.trim().split("\n")).toHaveLength(1);
});

test("a missing object-storage credential is told the same way", async () => {
  const { code, stderr } = await startWorker({
    INTERNAL_API_TOKEN: "a-shared-secret",
  });

  expect(code).not.toBe(0);
  expect(stderr).toContain("GARAGE_DEFAULT_ACCESS_KEY");
  expect(stderr).not.toContain("    at ");
});

test("a port that is not a port is told the same way", async () => {
  const { code, stderr } = await startWorker({
    INTERNAL_API_TOKEN: "a-shared-secret",
    WORKER_INTERNAL_PORT: "http",
    ...storage,
  });

  expect(code).not.toBe(0);
  expect(stderr).toContain("WORKER_INTERNAL_PORT");
  expect(stderr).not.toContain("    at ");
});
