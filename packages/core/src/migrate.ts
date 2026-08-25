// Forward-only schema migrations, applied wherever a stored document enters
// core (ADR-0001, node 73rm0x). The editor runs this at load so the next
// autosave persists the current version; the worker will run it on a job
// snapshot. FastAPI never migrates — it cannot: core is TypeScript-only
// (ADR-0003).
//
// v1 is the first schema. There is nothing to bring forward today. The
// `STEPS` table is the hook a version-2 change fills in.

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "./document.ts";

/** A stored document whose `schemaVersion` this core does not yet understand. */
export type SchemaTooNewError = {
  code: "schema_too_new";
  schemaVersion: number;
  supported: number;
  message: string;
};

export type MigrateResult =
  | { ok: true; document: unknown }
  | { ok: false; error: SchemaTooNewError };

/** Step that rewrites a document at version `n` into version `n + 1`.
 *  When schemaVersion becomes 2, add `1: migrateV1toV2`. */
const STEPS: Record<number, (document: unknown) => unknown> = {};

function schemaVersionOf(input: unknown): number | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === "number" && Number.isInteger(version) ? version : undefined;
}

/**
 * Bring unknown stored JSON up to the schema this core accepts.
 *
 * A current document is returned as-is. A newer version is refused by name
 * so the caller can block load rather than open and re-save it. Anything
 * without an integer `schemaVersion` is passed through for `validateDocument`.
 */
export function migrateDocument(input: unknown): MigrateResult {
  const version = schemaVersionOf(input);
  if (version === undefined) return { ok: true, document: input };
  if (version > DESIGN_DOCUMENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: "schema_too_new",
        schemaVersion: version,
        supported: DESIGN_DOCUMENT_SCHEMA_VERSION,
        message: `This document uses schema version ${String(version)}, which this app cannot open.`,
      },
    };
  }
  let current = input;
  for (let from = version; from < DESIGN_DOCUMENT_SCHEMA_VERSION; from += 1) {
    const step = STEPS[from];
    if (step === undefined) return { ok: true, document: current };
    current = step(current);
  }
  return { ok: true, document: current };
}
