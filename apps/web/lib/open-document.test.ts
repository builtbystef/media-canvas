import { DESIGN_DOCUMENT_SCHEMA_VERSION, type DesignDocument } from "@media-canvas/core";
import { expect, test } from "vitest";
import { openStoredDocument } from "./open-document";

function currentDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements: [],
  };
}

test("a current document opens as itself", () => {
  const stored = currentDocument();
  const opened = openStoredDocument(stored);

  expect(opened).toEqual({ ok: true, document: stored });
  expect(opened.ok && opened.document).toBe(stored);
});

test("a newer schema version is refused by name and is not opened", () => {
  const opened = openStoredDocument({ ...currentDocument(), schemaVersion: 2 });

  expect(opened.ok).toBe(false);
  if (opened.ok) throw new Error("expected a refusal");
  expect(opened.error.code).toBe("schema_too_new");
  if (opened.error.code !== "schema_too_new") throw new Error("expected schema_too_new");
  expect(opened.error.schemaVersion).toBe(2);
  expect(opened.error.supported).toBe(DESIGN_DOCUMENT_SCHEMA_VERSION);
});

test("invalid current-version JSON is not opened as a document", () => {
  const opened = openStoredDocument({ schemaVersion: 1, elements: [] });

  expect(opened.ok).toBe(false);
  if (opened.ok) throw new Error("expected a refusal");
  expect(opened.error.code).toBe("invalid_document");
});

test("an Unknown Token does not block opening", () => {
  const stored: DesignDocument = {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    variables: [{ name: "price", type: "text" }],
    elements: [
      {
        id: "headline",
        type: "text",
        x: 0,
        y: 0,
        width: 200,
        rotation: 0,
        opacity: 1,
        visible: true,
        content: "Now {{prce}}",
        fontAssetId: "font",
        fontSize: 16,
        lineHeight: 1.2,
        letterSpacing: 0,
        align: "left",
        anchor: "top",
        color: "#000000",
      },
    ],
  };

  expect(openStoredDocument(stored)).toEqual({ ok: true, document: stored });
});
