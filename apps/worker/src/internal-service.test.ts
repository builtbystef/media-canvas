import type { AddressInfo } from "node:net";

import type { DesignDocument, Element, VariableDecl } from "@media-canvas/core";
import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import { afterEach, expect, test } from "vitest";

import {
  createInternalService,
  DEFAULT_INTERNAL_PORT,
  internalServiceConfig,
} from "./internal-service.ts";

const TOKEN = "internal-token-for-tests";

let running: { close: () => Promise<void> } | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

/** The service under test, listening on a port the OS picks, with a caller
 *  that speaks to it the way the api does. */
async function serve(): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
  const server = createInternalService({ token: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  running = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  const { port } = server.address() as AddressInfo;
  return (path, init) => fetch(`http://127.0.0.1:${String(port)}${path}`, init);
}

test("a request without the shared internal credential is refused", async () => {
  const call = await serve();

  const response = await call("/validate", { method: "POST", body: "{}" });

  expect(response.status).toBe(401);
});

test("a request carrying the wrong credential is refused", async () => {
  const call = await serve();

  const response = await call("/validate", {
    method: "POST",
    headers: { authorization: "Bearer not-the-token" },
    body: "{}",
  });

  expect(response.status).toBe(401);
});

/** A Template over the Variables under test, each bound at a site that takes
 *  its type, so the document authority sees a document worth having. */
function template(variables: VariableDecl[]): DesignDocument {
  const tokens = variables.filter(
    (variable) => variable.type === "text" || variable.type === "number",
  );
  const elements: Element[] = [
    {
      id: "line",
      type: "text",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      width: 100,
      content: tokens.map((variable) => `{{${variable.name}}}`).join(" "),
      fontAssetId: "font",
      fontSize: 16,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: "left",
      anchor: "top",
      color: "#000000",
    },
  ];
  for (const [index, variable] of variables.entries()) {
    const base = { id: `bound-${String(index)}`, x: 0, y: 0, rotation: 0, opacity: 1 } as const;
    if (variable.type === "boolean") {
      elements.push({
        ...base,
        type: "rect",
        visible: { $var: variable.name },
        width: 10,
        height: 10,
        fill: "#000000",
      });
    }
    if (variable.type === "color") {
      elements.push({
        ...base,
        type: "rect",
        visible: true,
        width: 10,
        height: 10,
        fill: { $var: variable.name },
      });
    }
    if (variable.type === "image") {
      elements.push({
        ...base,
        type: "image",
        visible: true,
        width: 10,
        height: 10,
        src: { $var: variable.name },
        naturalWidth: 10,
        naturalHeight: 10,
        fitMode: "cover",
        clip: "none",
      });
    }
  }
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    variables,
    elements,
  };
}

/** The Variables of the issue's worked example: one defaulted, one required. */
const PRICED: VariableDecl[] = [
  { name: "headline", type: "text", default: "Sale" },
  { name: "price", type: "number" },
];

/** A validate call, as the api makes it. */
async function validateBatch(
  call: (path: string, init?: RequestInit) => Promise<Response>,
  payload: unknown,
): Promise<{
  status: number;
  body: { errors: unknown[]; templateErrors: unknown[]; rows?: Record<string, unknown>[] };
}> {
  const response = await call("/validate", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      errors: unknown[];
      templateErrors: unknown[];
      rows?: Record<string, unknown>[];
    },
  };
}

test("a batch whose every Row is good validates with no errors", async () => {
  const call = await serve();

  const { status, body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template(PRICED),
    rows: [{ headline: "Half price", price: 4.99 }, { price: 12 }],
  });

  expect(status).toBe(200);
  expect(body).toEqual({ errors: [], templateErrors: [] });
});

test("a Row missing a Variable with no default is one error, by row index", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template(PRICED),
    rows: [{ price: 1 }, { headline: "No price here" }, { price: 3 }],
  });

  expect(body.errors).toHaveLength(1);
  expect(body.errors[0]).toMatchObject({ rowIndex: 1, variable: "price" });
  expect((body.errors[0] as { message: string }).message).toContain("price");
});

test("Rows count from zero, so a bad first Row is row index 0", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template(PRICED),
    rows: [{ headline: "No price here" }],
  });

  expect(body.errors).toMatchObject([{ rowIndex: 0, variable: "price" }]);
});

test("a broken Template is reported as the document authority reports it, not as bad Rows", async () => {
  const call = await serve();
  const broken = template(PRICED);
  // A token naming no declared Variable: a Template problem, in every Row at once.
  broken.elements[0] = { ...broken.elements[0], content: "{{nowhere}}" } as never;

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: broken,
    rows: [{ price: 1 }, { price: 2 }],
  });

  expect(body.errors).toEqual([]);
  expect(body.templateErrors).toMatchObject([{ variable: "nowhere", elementId: "line" }]);
});

test("asked to type cells, a number cell becomes the number before validation", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template(PRICED),
    rows: [{ headline: "Half price", price: "4.99" }],
    cells: true,
  });

  expect(body.errors).toEqual([]);
  expect(body.rows).toEqual([{ headline: "Half price", price: 4.99 }]);
});

test("a boolean cell is the lowercase literal, so `True` is an error naming the Variable", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template([{ name: "sold", type: "boolean" }]),
    rows: [{ sold: "true" }, { sold: "True" }],
    cells: true,
  });

  expect(body.errors).toMatchObject([{ rowIndex: 1, variable: "sold" }]);
});

test("a cell that is not a number is one error naming the Variable", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template(PRICED),
    // The JSON number grammar and nothing looser: no trailing text, no leading
    // plus, no bare fraction.
    rows: [{ price: "4.99x" }, { price: "+1" }, { price: ".5" }, { price: "-4.99e2" }],
    cells: true,
  });

  expect(body.errors).toMatchObject([
    { rowIndex: 0, variable: "price" },
    { rowIndex: 1, variable: "price" },
    { rowIndex: 2, variable: "price" },
  ]);
  expect(body.rows?.[3]).toEqual({ price: -499 });
});

test("an empty cell means omitted, so a declared default applies — text included", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template([
      { name: "headline", type: "text", default: "Sale" },
      { name: "sold", type: "boolean", default: false },
    ]),
    rows: [{ headline: "", sold: "" }],
    cells: true,
  });

  expect(body.errors).toEqual([]);
  expect(body.rows).toEqual([{}]);
});

test("an empty cell for a Variable with no default is one error naming it", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template([{ name: "headline", type: "text" }]),
    rows: [{ headline: "" }],
    cells: true,
  });

  expect(body.errors).toMatchObject([{ rowIndex: 0, variable: "headline" }]);
});

test("through the JSON channel an explicit empty string is a text value, not an omission", async () => {
  const call = await serve();

  const { body } = await validateBatch(call, {
    workspaceId: "workspace-1",
    template: template([{ name: "headline", type: "text" }]),
    rows: [{ headline: "" }],
  });

  expect(body.errors).toEqual([]);
});

test("a payload without the Workspace is refused, since both internal calls carry one", async () => {
  const call = await serve();

  const { status } = await validateBatch(call, {
    template: template(PRICED),
    rows: [{ price: 1 }],
  });

  expect(status).toBe(400);
});

test("a body that is not a batch at all is refused, not answered with errors", async () => {
  const call = await serve();

  const { status } = await validateBatch(call, { workspaceId: "workspace-1", rows: "two" });

  expect(status).toBe(400);
});

test("the service takes its port and its credential from the environment", () => {
  expect(
    internalServiceConfig({ INTERNAL_API_TOKEN: "a-shared-secret", WORKER_INTERNAL_PORT: "4100" }),
  ).toEqual({ token: "a-shared-secret", port: 4100 });
});

test("only the credential is required; the port has the development default", () => {
  expect(internalServiceConfig({ INTERNAL_API_TOKEN: "a-shared-secret" })).toEqual({
    token: "a-shared-secret",
    port: DEFAULT_INTERNAL_PORT,
  });
});

test("an environment describing no runnable service fails naming the variable at fault", () => {
  expect(() => internalServiceConfig({})).toThrow("INTERNAL_API_TOKEN");
  expect(() =>
    internalServiceConfig({ INTERNAL_API_TOKEN: "a-shared-secret", WORKER_INTERNAL_PORT: "http" }),
  ).toThrow("WORKER_INTERNAL_PORT");
});

/** Ask the service what a font file is, the way the api asks: the bytes
 *  themselves as the body, and the shared credential in the header. */
async function inspectFont(
  call: (path: string, init?: RequestInit) => Promise<Response>,
  bytes: ArrayBuffer,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await call("/fonts/inspect", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/octet-stream",
    },
    body: bytes,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** One vendored file's bytes, by the name of the file. */
function bundled(file: string): ArrayBuffer {
  const font = bundledFonts.find((candidate) => candidate.file === file);
  if (font === undefined) throw new Error(`no bundled font at ${file}`);
  return bundledFontBytes(font);
}

test("a font the compiler can read is reported by what its own tables say", async () => {
  const call = await serve();

  const { status, body } = await inspectFont(call, bundled("inter/Inter_18pt-Regular.ttf"));

  expect(status).toBe(200);
  expect(body).toEqual({
    readable: true,
    font: {
      format: "ttf",
      family: "Inter 18pt",
      subfamily: "Regular",
      weight: 400,
      italic: false,
      postScriptName: "Inter18pt-Regular",
      variable: false,
    },
  });
});

test("the file's own style bits are read, not its file name", async () => {
  const call = await serve();

  const { body } = await inspectFont(call, bundled("inter/Inter_18pt-BoldItalic.ttf"));

  expect(body.font).toMatchObject({ weight: 700, italic: true, subfamily: "Bold Italic" });
});

test("a WOFF2 is no Font Asset, whatever it holds inside", async () => {
  const call = await serve();

  const { status, body } = await inspectFont(call, woff2(bundled("lora/Lora-Regular.ttf")));

  expect(status).toBe(200);
  expect(body).toEqual({ readable: false, problem: "unsupported_format" });
});

test("a file of the right shape the parser cannot read is told apart from one of the wrong shape", async () => {
  const call = await serve();

  const truncated = bundled("lora/Lora-Regular.ttf").slice(0, 200);
  const { body } = await inspectFont(call, truncated);

  expect(body).toEqual({ readable: false, problem: "unparseable_font" });
});

/** A WOFF2 file wrapping a font: the signature that says which format this
 *  is, the flavor of the font within, and the lengths. Nothing here
 *  compresses the wrapped font — the signature is as far as any reader of a
 *  file this product does not take ever gets. */
function woff2(font: ArrayBuffer): ArrayBuffer {
  const HEADER = 48;
  const file = new Uint8Array(HEADER + font.byteLength);
  const header = new DataView(file.buffer);
  header.setUint32(0, 0x77_4f_46_32); // "wOF2"
  header.setUint32(4, new DataView(font).getUint32(0)); // the flavor inside
  header.setUint32(8, file.byteLength);
  header.setUint32(16, font.byteLength); // the sfnt it would decompress to
  header.setUint32(20, font.byteLength);
  file.set(new Uint8Array(font), HEADER);
  return file.buffer;
}

test("a variable font is readable, and reports itself as one", async () => {
  const call = await serve();

  const { status, body } = await inspectFont(
    call,
    withVariationAxes(bundled("oswald/Oswald-Regular.ttf")),
  );

  expect(status).toBe(200);
  expect(body).toMatchObject({ readable: true, font: { variable: true, family: "Oswald" } });
});

/** The same font, carrying one variation axis — which is what makes a file a
 *  variable font, and what an uploader is refused for. Written by hand
 *  because no vendored file is one: the sfnt directory is rebuilt with one
 *  more table in it, and the axis is the weight axis a variable text face
 *  would carry. */
function withVariationAxes(font: ArrayBuffer): ArrayBuffer {
  const source = new DataView(font);
  const count = source.getUint16(4);
  const tables: { tag: number; bytes: Uint8Array }[] = [];
  for (let record = 12; record < 12 + count * 16; record += 16) {
    tables.push({
      tag: source.getUint32(record),
      bytes: new Uint8Array(font, source.getUint32(record + 8), source.getUint32(record + 12)),
    });
  }
  tables.push({ tag: 0x66_76_61_72, bytes: weightAxis() }); // "fvar"
  tables.sort((one, other) => one.tag - other.tag);

  const directory = 12 + tables.length * 16;
  const padded = (length: number): number => length + ((4 - (length % 4)) % 4);
  const size = tables.reduce((total, table) => total + padded(table.bytes.byteLength), directory);
  const file = new Uint8Array(size);
  const out = new DataView(file.buffer);
  out.setUint32(0, source.getUint32(0));
  out.setUint16(4, tables.length);
  let at = directory;
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    out.setUint32(record, table.tag);
    out.setUint32(record + 8, at);
    out.setUint32(record + 12, table.bytes.byteLength);
    file.set(table.bytes, at);
    at += padded(table.bytes.byteLength);
  });
  return file.buffer;
}

/** An `fvar` table declaring one axis: weight, 100 to 900, default 400. */
function weightAxis(): Uint8Array {
  const table = new Uint8Array(16 + 20);
  const out = new DataView(table.buffer);
  out.setUint32(0, 0x00_01_00_00); // table version
  out.setUint16(4, 16); // where the axis records start
  out.setUint16(6, 2); // count-size pairs
  out.setUint16(8, 1); // one axis
  out.setUint16(10, 20); // each axis record's size
  out.setUint16(12, 0); // no named instances
  out.setUint16(14, 4);
  out.setUint32(16, 0x77_67_68_74); // "wght"
  out.setInt32(20, 100 << 16); // minimum, as a 16.16 fixed number
  out.setInt32(24, 400 << 16); // default
  out.setInt32(28, 900 << 16); // maximum
  out.setUint16(32, 0); // flags
  out.setUint16(34, 256); // the name this axis is shown under
  return table;
}

test("font inspection is behind the same credential as every other internal call", async () => {
  const call = await serve();

  const response = await call("/fonts/inspect", {
    method: "POST",
    body: bundled("pacifico/Pacifico-Regular.ttf"),
  });

  expect(response.status).toBe(401);
});
