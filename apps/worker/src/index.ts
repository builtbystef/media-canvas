import {
  createInternalService,
  explainListenFailure,
  internalServiceConfig,
  InternalServiceConfigError,
} from "./internal-service.ts";
import { createS3OutputStore, outputStoreConfig } from "./outputs.ts";
import { createPagePool } from "./page-pool.ts";
import { redisConnection } from "./redis.ts";
import { createRowConsumer } from "./row-consumer.ts";
import { startRowQueue } from "./row-queue.ts";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readConfig(): {
  token: string;
  port: number;
  apiBaseUrl: string;
  outputs: ReturnType<typeof outputStoreConfig>;
  redis: ReturnType<typeof redisConnection>;
} {
  try {
    const http = internalServiceConfig(process.env);
    const outputs = outputStoreConfig(process.env);
    const redis = redisConnection(process.env);
    return { ...http, outputs, redis };
  } catch (failure) {
    if (!(failure instanceof InternalServiceConfigError)) throw failure;
    return fail(failure.message);
  }
}

const { token, port, apiBaseUrl, outputs, redis } = readConfig();
const pool = createPagePool();
const service = createInternalService({ token, apiBaseUrl, pool });
const consumer = createRowConsumer({
  apiBaseUrl,
  token,
  pool,
  outputs: createS3OutputStore(outputs),
});

service.on("error", (failure: unknown) => {
  const explanation = explainListenFailure(failure, port);
  if (explanation === undefined) throw failure;
  fail(explanation);
});

service.listen(port, () => {
  console.log(`render worker: internal service on port ${String(port)}`);
  startRowQueue({ redis, consumer });
});
