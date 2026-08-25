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

/**
 * What the editor does with stored JSON at load: migrate first, then validate.
 *
 * A newer schema is refused by name and never opened. An older one would be
 * brought forward here (the hook lives in core); v1 is the first schema, so
 * today only the refusal is exercised. Invalid current-version JSON is the
 * same refusal the canvas already showed.
 */
export function openStoredDocument(stored: unknown): OpenDocumentResult {
  const migrated = migrateDocument(stored);
  if (!migrated.ok) return migrated;
  if (validateDocument(migrated.document).length > 0) {
    return { ok: false, error: { code: "invalid_document", message: NOT_A_DOCUMENT } };
  }
  return { ok: true, document: migrated.document as DesignDocument };
}
