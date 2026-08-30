import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "./document.ts";

export type SchemaTooNewError = {
  code: "schema_too_new";
  schemaVersion: number;
  supported: number;
  message: string;
};

export type MigrateResult =
  | { ok: true; document: unknown }
  | { ok: false; error: SchemaTooNewError };

const STEPS: Record<number, (document: unknown) => unknown> = {};

function schemaVersionOf(input: unknown): number | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === "number" && Number.isInteger(version) ? version : undefined;
}

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
