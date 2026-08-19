// The render worker (ADR-0002/0003): it consumes per-Row BullMQ tasks, renders
// the compiled document in pinned headless Chromium, and reports results
// through the internal FastAPI endpoint (ADR-0005). Its other half is the
// internal HTTP service below, which the api calls for everything that means
// reading a Design Document — the api treats one as opaque JSON. The queue
// consumer lands with the render pipeline.

import { createInternalService, internalServiceConfig } from "./internal-service.ts";

const { token, port } = internalServiceConfig(process.env);

createInternalService({ token }).listen(port, () => {
  console.log(`render worker: internal service on port ${String(port)}`);
});
