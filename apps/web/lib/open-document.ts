import {
  migrateDocument,
  validateDocument,
  type DesignDocument,
  type SchemaTooNewError,
} from "@media-canvas/core";

export type OpenDocumentError = SchemaTooNewError | { code: "invalid_document"; message: string };

export type OpenDocumentResult =
  | { ok: true; document: DesignDocument }
  | { ok: false; error: OpenDocumentError };

const NOT_A_DOCUMENT = "This document is not a v1 Design Document, so there is nothing to draw.";

export function openStoredDocument(stored: unknown): OpenDocumentResult {
  const migrated = migrateDocument(stored);
  if (!migrated.ok) return migrated;
  const errors = validateDocument(migrated.document);
  const declared = new Set(
    (migrated.document as DesignDocument).variables?.map((variable) => variable.name) ?? [],
  );
  if (errors.some((error) => error.variable === undefined || declared.has(error.variable))) {
    return { ok: false, error: { code: "invalid_document", message: NOT_A_DOCUMENT } };
  }
  return { ok: true, document: migrated.document as DesignDocument };
}
