import type { RenderBody, RenderRefusal } from "@media-canvas/api-client";
import type { DesignDocument, TextElement, VariableDecl } from "@media-canvas/core";
import { expect, test } from "vitest";
import { failedToChangeDocument } from "./failures";
import {
  DEFAULT_GENERATE_FORMAT,
  downloadName,
  fieldErrors,
  GENERATE_FORMATS,
  generateDocument,
  initialValues,
  outputFormat,
} from "./generate";

function template(variables: VariableDecl[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    variables,
    elements: [],
  };
}

test("a text Variable is prefilled with its default, and an empty minLength field blocks generate", () => {
  const headline: VariableDecl = {
    name: "headline",
    type: "text",
    default: "Sale",
    constraints: { minLength: 1 },
  };
  const document = template([headline]);

  const filled = initialValues(document);
  expect(filled).toEqual({ headline: "Sale" });
  expect(fieldErrors(document, filled)).toEqual({});

  const empty = { headline: "" };
  expect(fieldErrors(document, empty)).toEqual({
    headline: 'the Variable "headline" must be at least 1 characters long',
  });
});

test("inline checks are the Variable constraints, not other document problems", () => {
  const headline: VariableDecl = {
    name: "headline",
    type: "text",
    constraints: { minLength: 1 },
  };
  const text: TextElement = {
    id: "t1",
    type: "text",
    x: 0,
    y: 0,
    width: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "Now {{prce}}",
    fontAssetId: "inter",
    fontSize: 12,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
  };
  const document: DesignDocument = {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    variables: [headline],
    elements: [text],
  };

  expect(fieldErrors(document, { headline: "" })).toEqual({
    headline: 'the Variable "headline" must be at least 1 characters long',
  });
  expect(fieldErrors(document, { headline: "Hello" })).toEqual({});
});

test("each type is prefilled with its own default, and a design has no values", () => {
  const variables: VariableDecl[] = [
    { name: "headline", type: "text", default: "Sale" },
    { name: "price", type: "number", default: 4.99 },
    { name: "onSale", type: "boolean", default: true },
    { name: "brand", type: "color", default: "#0055FF" },
    { name: "photo", type: "image", default: "img-1" },
  ];
  expect(initialValues(template(variables))).toEqual({
    headline: "Sale",
    price: 4.99,
    onSale: true,
    brand: "#0055FF",
    photo: "img-1",
  });
  expect(initialValues(template([]))).toEqual({});
});

test("the format picker is PNG at 1×, 2× or 3×, JPEG with a quality, or PDF — exactly one", () => {
  expect(GENERATE_FORMATS).toEqual(["png", "jpeg", "pdf"]);
  expect(DEFAULT_GENERATE_FORMAT).toEqual({ format: "png", scale: 1 });

  expect(outputFormat({ format: "png", scale: 1 })).toEqual({ format: "png", scale: 1 });
  expect(outputFormat({ format: "png", scale: 2 })).toEqual({ format: "png", scale: 2 });
  expect(outputFormat({ format: "png", scale: 3 })).toEqual({ format: "png", scale: 3 });
  expect(outputFormat({ format: "jpeg", quality: 80 })).toEqual({ format: "jpeg", quality: 80 });
  expect(outputFormat({ format: "jpeg" })).toEqual({ format: "jpeg", quality: 90 });
  expect(outputFormat({ format: "jpeg", quality: 0 })).toEqual({ format: "jpeg", quality: 1 });
  expect(outputFormat({ format: "jpeg", quality: 200 })).toEqual({ format: "jpeg", quality: 100 });
  expect(outputFormat({ format: "pdf" })).toEqual({ format: "pdf" });
});

test("the download is named after the document", () => {
  expect(downloadName("Poster", { format: "png", scale: 2 })).toBe("Poster.png");
  expect(downloadName("Poster", { format: "jpeg", quality: 90 })).toBe("Poster.jpg");
  expect(downloadName("Poster", { format: "pdf" })).toBe("Poster.pdf");
});

test("generating a design sends no values and returns the file named after the document", async () => {
  const bytes = new Blob(["png-bytes"], { type: "image/png" });
  let sent: { documentId: string; body: RenderBody } | undefined;
  const result = await generateDocument(
    {
      documentId: "doc-1",
      name: "Poster",
      kind: "design",
      values: { leftover: "no" },
      format: { format: "png", scale: 2 },
    },
    async ({ path, body }) => {
      sent = { documentId: path.documentId, body };
      return { data: bytes, error: undefined, response: new Response(bytes, { status: 200 }) };
    },
  );

  expect(sent).toEqual({
    documentId: "doc-1",
    body: { output: { format: "png", scale: 2 } },
  });
  expect(result).toEqual({ ok: true, file: bytes, filename: "Poster.png" });
});

test("generating a template sends the form values", async () => {
  const bytes = new Blob(["png-bytes"], { type: "image/png" });
  let sent: RenderBody | undefined;
  await generateDocument(
    {
      documentId: "tpl-1",
      name: "Poster",
      kind: "template",
      values: { headline: "Hello" },
      format: { format: "pdf" },
    },
    async ({ body }) => {
      sent = body;
      return { data: bytes, error: undefined, response: new Response(bytes, { status: 200 }) };
    },
  );

  expect(sent).toEqual({
    values: { headline: "Hello" },
    output: { format: "pdf" },
  });
});

test("a named-Variable 422 points at that input and is not a download", async () => {
  const refusal: RenderRefusal = {
    errors: [
      {
        variable: "headline",
        message: 'the Variable "headline" must be at least 1 characters long',
      },
    ],
  };
  const result = await generateDocument(
    {
      documentId: "tpl-1",
      name: "Poster",
      kind: "template",
      values: { headline: "" },
      format: DEFAULT_GENERATE_FORMAT,
    },
    async () => ({
      data: undefined,
      error: refusal,
      response: new Response(JSON.stringify(refusal), { status: 422 }),
    }),
  );

  expect(result).toEqual({
    ok: false,
    fieldErrors: { headline: 'the Variable "headline" must be at least 1 characters long' },
    message: null,
  });
});

test("an unnamed refusal stays in the dialog as the message it came back with", async () => {
  const refusal: RenderRefusal = {
    errors: [{ message: "A design renders with no values." }],
  };
  const result = await generateDocument(
    {
      documentId: "doc-1",
      name: "Poster",
      kind: "design",
      values: {},
      format: DEFAULT_GENERATE_FORMAT,
    },
    async () => ({
      data: undefined,
      error: refusal,
      response: new Response(JSON.stringify(refusal), { status: 422 }),
    }),
  );

  expect(result).toEqual({
    ok: false,
    fieldErrors: {},
    message: "A design renders with no values.",
  });
});

test("a lost connection is the same wording the rest of the editor uses", async () => {
  const result = await generateDocument(
    {
      documentId: "doc-1",
      name: "Poster",
      kind: "design",
      values: {},
      format: DEFAULT_GENERATE_FORMAT,
    },
    async () => ({ data: undefined, error: {}, response: undefined }),
  );

  expect(result).toEqual({
    ok: false,
    fieldErrors: {},
    message: failedToChangeDocument(undefined),
  });
});
