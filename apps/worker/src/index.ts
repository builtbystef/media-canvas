// The render worker (ADR-0002/0003): consumes per-Row BullMQ tasks, renders
// the compiled document in pinned headless Chromium, and reports results
// through the internal FastAPI endpoint (ADR-0005). Skeleton until the render
// pipeline lands.

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "@media-canvas/core";

console.log(`render worker skeleton — Design Document schema v${DESIGN_DOCUMENT_SCHEMA_VERSION}`);
