import type { DocumentView } from "@media-canvas/api-client";
import { expect, test } from "vitest";
import { failedToPromoteDocument } from "./failures";
import { promoteToTemplate } from "./promote";
import { editorPath } from "./routes";

function template(id: string): DocumentView {
  return {
    id,
    kind: "template",
    name: "Poster",
    schemaVersion: 1,
    revision: 1,
    promotedFromId: "design-1",
    createdAt: "2026-08-25T00:00:00Z",
    updatedAt: "2026-08-25T00:00:00Z",
    document: { schemaVersion: 1 },
  };
}

test("a successful promote returns the new template and the path the editor opens", async () => {
  const created = template("template-1");
  const result = await promoteToTemplate("design-1", async () => ({
    data: created,
    error: undefined,
    response: new Response(null, { status: 201 }),
  }));

  expect(result).toEqual({ ok: true, document: created, path: editorPath("template-1") });
  expect(result.ok && result.path).toBe("/documents/template-1");
});

test("a refused promote keeps the wording the list already uses", async () => {
  const result = await promoteToTemplate("already-a-template", async () => ({
    data: undefined,
    error: { detail: "Only a design can be promoted." },
    response: new Response(null, { status: 422 }),
  }));

  expect(result).toEqual({ ok: false, message: failedToPromoteDocument(422) });
});
