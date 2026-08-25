// The wait list the api writes (ADR-0004): one task per Row, identifiers
// only. This end pops them, runs the consumer, and puts a failed attempt
// back so the contract's single retry happens — without a second queue
// library, speaking the same layout the producer already writes.

import { PAGE_POOL_SIZE } from "./page-pool.ts";
import { connectRedis, type RedisClient, type RedisConnection } from "./redis.ts";
import { ValueRefusal } from "./render-document.ts";
import type { RowConsumer } from "./row-consumer.ts";

export const QUEUE_NAME = "rows";
export const QUEUE_PREFIX = `bull:${QUEUE_NAME}`;
export const ROW_CONCURRENCY = PAGE_POOL_SIZE;

export type RowQueue = {
  close(): Promise<void>;
};

/** Pop Row tasks and run them, eight at a time — the same number as the
 *  page pool they render through. */
export function startRowQueue(options: {
  redis: RedisConnection;
  consumer: RowConsumer;
  concurrency?: number;
}): RowQueue {
  const concurrency = options.concurrency ?? ROW_CONCURRENCY;
  let closed = false;
  const running = run();

  return {
    async close() {
      closed = true;
      await running;
    },
  };

  async function run(): Promise<void> {
    await untilConnected(async (client) => recoverStalled(client));
    if (closed) return;
    await Promise.all(Array.from({ length: concurrency }, () => runSlot()));
  }

  async function runSlot(): Promise<void> {
    while (!closed) {
      let client: RedisClient | undefined;
      try {
        client = await connectRedis(options.redis);
        while (!closed) {
          const id = await client.send(
            "BLMOVE",
            `${QUEUE_PREFIX}:wait`,
            `${QUEUE_PREFIX}:active`,
            "RIGHT",
            "LEFT",
            "5",
          );
          if (typeof id !== "string" || closed) continue;
          await handle(client, id);
        }
      } catch {
        if (closed) return;
        await sleep(1000);
      } finally {
        await client?.close().catch(() => undefined);
      }
    }
  }

  async function untilConnected(use: (client: RedisClient) => Promise<void>): Promise<void> {
    while (!closed) {
      try {
        const client = await connectRedis(options.redis);
        try {
          await use(client);
        } finally {
          await client.close().catch(() => undefined);
        }
        return;
      } catch {
        await sleep(1000);
      }
    }
  }

  async function handle(client: RedisClient, id: string): Promise<void> {
    const hash = await hgetall(client, `${QUEUE_PREFIX}:${id}`);
    const task = asTask(hash.data);
    if (task === undefined) {
      await finish(client, id);
      return;
    }
    const maxAttempts = attemptsOf(hash.opts);
    const attempt = Number(
      await client.send("HINCRBY", `${QUEUE_PREFIX}:${id}`, "attemptsMade", "1"),
    );
    try {
      await options.consumer.process({ ...task, attempt, maxAttempts });
      await finish(client, id);
    } catch (failure) {
      if (failure instanceof ValueRefusal || attempt >= maxAttempts) {
        await finish(client, id);
        return;
      }
      await requeue(client, id);
    }
  }
}

async function recoverStalled(client: RedisClient): Promise<void> {
  const stalled = await client.send("LRANGE", `${QUEUE_PREFIX}:active`, "0", "-1");
  if (!Array.isArray(stalled)) return;
  for (const id of stalled) {
    if (typeof id !== "string") continue;
    await client.send("LREM", `${QUEUE_PREFIX}:active`, "1", id);
    await client.send("RPUSH", `${QUEUE_PREFIX}:wait`, id);
  }
  if (stalled.length > 0) {
    await client.send("ZADD", `${QUEUE_PREFIX}:marker`, "0", "0");
  }
}

async function finish(client: RedisClient, id: string): Promise<void> {
  await client.send("LREM", `${QUEUE_PREFIX}:active`, "1", id);
  await client.send("DEL", `${QUEUE_PREFIX}:${id}`);
}

async function requeue(client: RedisClient, id: string): Promise<void> {
  await client.send("LREM", `${QUEUE_PREFIX}:active`, "1", id);
  await client.send("LPUSH", `${QUEUE_PREFIX}:wait`, id);
  await client.send("ZADD", `${QUEUE_PREFIX}:marker`, "0", "0");
}

async function hgetall(client: RedisClient, key: string): Promise<Record<string, string>> {
  const raw = await client.send("HGETALL", key);
  if (!Array.isArray(raw)) return {};
  const found: Record<string, string> = {};
  for (let i = 0; i < raw.length; i += 2) {
    const field = raw[i];
    const value = raw[i + 1];
    if (typeof field !== "string" || typeof value !== "string") continue;
    found[field] = value;
  }
  return found;
}

function asTask(data: string | undefined): { jobId: string; rowId: string } | undefined {
  if (data === undefined) return undefined;
  try {
    const parsed = JSON.parse(data) as { jobId?: unknown; rowId?: unknown };
    if (typeof parsed.jobId !== "string" || typeof parsed.rowId !== "string") return undefined;
    return { jobId: parsed.jobId, rowId: parsed.rowId };
  } catch {
    return undefined;
  }
}

function attemptsOf(opts: string | undefined): number {
  if (opts === undefined) return 2;
  try {
    const parsed = JSON.parse(opts) as { attempts?: unknown };
    return typeof parsed.attempts === "number" && parsed.attempts >= 1 ? parsed.attempts : 2;
  } catch {
    return 2;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
