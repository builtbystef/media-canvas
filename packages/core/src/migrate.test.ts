import { expect, test } from "vitest";

import type { DesignDocument } from "./index.ts";
import { DESIGN_DOCUMENT_SCHEMA_VERSION, migrateDocument } from "./index.ts";

function currentDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements: [],
  };
}

test("a current document is returned unchanged, by identity", () => {
  const document = currentDocument();
  const result = migrateDocument(document);

  expect(result).toEqual({ ok: true, document });
  expect(result.ok && result.document).toBe(document);
});

test("a newer schema version is refused with a named error and is not opened", () => {
  const stored = { ...currentDocument(), schemaVersion: 2 };
  const result = migrateDocument(stored);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a refusal");
  expect(result.error.code).toBe("schema_too_new");
  expect(result.error.schemaVersion).toBe(2);
  expect(result.error.supported).toBe(DESIGN_DOCUMENT_SCHEMA_VERSION);
});

test("a document without an integer schemaVersion is left for validation", () => {
  const stored = { canvas: { width: 1, height: 1, background: "#000000" }, elements: [] };
  const result = migrateDocument(stored);

  expect(result).toEqual({ ok: true, document: stored });
});
