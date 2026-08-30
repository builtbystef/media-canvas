import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { DesignDocument, Element, ImageElement, VariableDecl } from "@media-canvas/core";
import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import { afterEach, expect, test } from "vitest";

import { writePng } from "./goldens/png.ts";
import { createInternalService } from "./internal-service.ts";
import type { PagePool } from "./page-pool.ts";

const TOKEN = "internal-token-for-tests";

let running: { close: () => Promise<void> } | undefined;
const extra: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  await Promise.all(extra.splice(0).map((item) => item.close()));
});

function unusedPool(): PagePool {
  return {
    opened: 0,
    async render() {
      throw new Error("opened a page");
    },
    async close() {},
  };
}

function recordingPool(bytes: Uint8Array): PagePool & { svgs: string[] } {
  const svgs: string[] = [];
  return {
    opened: 0,
    svgs,
    async render(svg) {
      svgs.push(svg);
      return bytes;
    },
    async close() {},
  };
}

async function serve(
  pages: PagePool = unusedPool(),
  apiBaseUrl?: string,
): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
  const server = createInternalService({
    token: TOKEN,
    pool: pages,
    ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
  });
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

function template(variables: VariableDecl[], elements: Element[] = []): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 64, height: 64, background: "#FFFFFF" },
    variables,
    elements:
      elements.length > 0
        ? elements
        : [
            {
              id: "box",
              type: "rect",
              x: 0,
              y: 0,
              width: 64,
              height: 64,
              rotation: 0,
              opacity: 1,
              visible: true,
              fill: "#CC0000",
            },
          ],
  };
}

async function render(
  call: (path: string, init?: RequestInit) => Promise<Response>,
  payload: unknown,
): Promise<Response> {
  return call("/render", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("values naming a Variable the Template does not declare are refused, and no page opens", async () => {
  const call = await serve();

  const response = await render(call, {
    workspaceId: "workspace-1",
    template: template([{ name: "headline", type: "text", default: "Sale" }]),
    values: { headline: "Hi", extra: "nope" },
    output: { format: "png", scale: 1 },
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    errors: [{ variable: "extra" }],
  });
});

test("a Template plus values returns the file bytes", async () => {
  const file = solidPng(64, 64, 204, 0, 0);
  const pages = recordingPool(file);
  const call = await serve(pages);

  const response = await render(call, {
    workspaceId: "workspace-1",
    template: template([]),
    values: {},
    output: { format: "png", scale: 1 },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(file));
  expect(pages.svgs[0]).toContain("#CC0000");
  expect(pages.svgs[0]).toContain('width="64"');
});

test("the same request twice returns the same bytes, and nothing is persisted", async () => {
  const file = solidPng(64, 64, 204, 0, 0);
  const pages = recordingPool(file);
  const call = await serve(pages);
  const payload = {
    workspaceId: "workspace-1",
    template: template([]),
    values: {},
    output: { format: "png" as const, scale: 1 as const },
  };

  const first = new Uint8Array(await (await render(call, payload)).arrayBuffer());
  const second = new Uint8Array(await (await render(call, payload)).arrayBuffer());

  expect(first).toEqual(second);
  expect(pages.svgs).toHaveLength(2);
  expect(pages.svgs[0]).toEqual(pages.svgs[1]);
});

test("an asset that cannot be fetched fails naming it, without opening a page", async () => {
  const api = await standInAssets({});
  const call = await serve(unusedPool(), api.url);

  const response = await render(call, {
    workspaceId: "workspace-1",
    template: template([], [photo({ src: "gone" })]),
    values: {},
    output: { format: "png", scale: 1 },
  });

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { assetId: "gone" },
  });
  expect(api.hits).toEqual(["/internal/workspaces/workspace-1/assets/gone"]);
});

test("held and external images render without the page fetching anything", async () => {
  const red = solidPng(32, 32, 200, 0, 0);
  const blue = solidPng(32, 32, 0, 0, 200);
  const api = await standInAssets({ held: { bytes: red, type: "image/png" } });
  const remote = await standInFile("/scene.png", blue, "image/png");
  const pages = recordingPool(solidPng(64, 64, 0, 0, 0));
  const call = await serve(pages, api.url);

  const response = await render(call, {
    workspaceId: "workspace-1",
    template: template(
      [],
      [
        photo({ id: "left", src: "held", x: 0, width: 32, height: 32 }),
        photo({
          id: "right",
          src: `${remote.url}/scene.png`,
          x: 32,
          width: 32,
          height: 32,
        }),
      ],
    ),
    values: {},
    output: { format: "png", scale: 1 },
  });

  expect(response.status).toBe(200);
  expect(remote.hits).toBe(1);
  expect(api.hits).toEqual(["/internal/workspaces/workspace-1/assets/held"]);
  const svg = pages.svgs[0] ?? "";
  expect(svg).toContain("data:image/png;base64,");
  expect(svg).not.toContain(`${remote.url}/scene.png`);
});

test("a Font Asset is fetched from the same internal route and inlined", async () => {
  const font = bundledFonts.find(
    (candidate) =>
      candidate.family === "Inter" && candidate.weight === 400 && candidate.style === "normal",
  );
  if (font === undefined) throw new Error("no Inter regular in the bundled set");
  const api = await standInAssets({
    [font.id]: { bytes: new Uint8Array(bundledFontBytes(font)), type: "font/ttf" },
  });
  const pages = recordingPool(solidPng(64, 64, 255, 255, 255));
  const call = await serve(pages, api.url);

  const response = await render(call, {
    workspaceId: "workspace-1",
    template: template(
      [],
      [
        {
          id: "line",
          type: "text",
          x: 4,
          y: 4,
          width: 56,
          rotation: 0,
          opacity: 1,
          visible: true,
          content: "Hi",
          fontAssetId: font.id,
          fontSize: 24,
          lineHeight: 1.2,
          letterSpacing: 0,
          align: "left",
          anchor: "top",
          color: "#101828",
        },
      ],
    ),
    values: {},
    output: { format: "png", scale: 1 },
  });

  expect(response.status).toBe(200);
  expect(api.hits).toEqual([`/internal/workspaces/workspace-1/assets/${font.id}`]);
  expect(pages.svgs[0]).toContain("@font-face");
  expect(pages.svgs[0]).toContain("data:font/ttf;base64,");
});

function photo(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: "photo",
    type: "image",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    rotation: 0,
    opacity: 1,
    visible: true,
    src: "held",
    naturalWidth: 32,
    naturalHeight: 32,
    fitMode: "stretch",
    clip: "none",
    ...overrides,
  };
}

function solidPng(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const at = i * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = 255;
  }
  return writePng(width, height, data);
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  extra.push({ close });
  return { url: `http://127.0.0.1:${String(port)}`, close };
}

async function standInAssets(
  assets: Record<string, { bytes: Uint8Array; type: string }>,
): Promise<{ url: string; hits: string[] }> {
  const hits: string[] = [];
  const { url } = await listen((request, response) => {
    hits.push(request.url ?? "");
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401);
      response.end();
      return;
    }
    const match = /^\/internal\/workspaces\/[^/]+\/assets\/([^/?]+)$/.exec(request.url ?? "");
    const asset = match === null ? undefined : assets[match[1] ?? ""];
    if (asset === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": asset.type,
      "content-length": String(asset.bytes.byteLength),
    });
    response.end(Buffer.from(asset.bytes));
  });
  return { url, hits };
}

async function standInFile(
  path: string,
  bytes: Uint8Array,
  type: string,
): Promise<{ url: string; hits: number }> {
  const served = { url: "", hits: 0 };
  const listening = await listen((request, response) => {
    if (request.url !== path) {
      response.writeHead(404);
      response.end();
      return;
    }
    served.hits += 1;
    response.writeHead(200, { "content-type": type, "content-length": String(bytes.byteLength) });
    response.end(Buffer.from(bytes));
  });
  served.url = listening.url;
  return served;
}
