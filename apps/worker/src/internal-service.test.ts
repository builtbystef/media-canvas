import type { AddressInfo } from "node:net";

import type { DesignDocument, Element, VariableDecl } from "@media-canvas/core";
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
