// The render worker (ADR-0002/0003): it consumes per-Row BullMQ tasks, renders
// the compiled document in pinned headless Chromium, and reports results
// through the internal FastAPI endpoint (ADR-0005). Its other half is the
// internal HTTP service below, which the api calls for everything that means
// reading a Design Document — the api treats one as opaque JSON. The queue
// consumer lands with the render pipeline.
//
// Anything the worker cannot start with is said in one sentence and ends the
// process: a value the environment is missing, and a port it cannot have, are
// the same kind of news to whoever started it.

import {
  createInternalService,
  explainListenFailure,
  internalServiceConfig,
  InternalServiceConfigError,
} from "./internal-service.ts";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readConfig(): { token: string; port: number } {
  try {
    return internalServiceConfig(process.env);
  } catch (failure) {
    if (!(failure instanceof InternalServiceConfigError)) throw failure;
    return fail(failure.message);
  }
}

const { token, port } = readConfig();
const service = createInternalService({ token });

service.on("error", (failure: unknown) => {
  // A failure we cannot put in a sentence is worth its whole stack.
  const explanation = explainListenFailure(failure, port);
  if (explanation === undefined) throw failure;
  fail(explanation);
});

service.listen(port, () => {
  console.log(`render worker: internal service on port ${String(port)}`);
});
