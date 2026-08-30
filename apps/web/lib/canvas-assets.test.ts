import type { DesignDocument } from "@media-canvas/core";
import { expect, test } from "vitest";

import { type AssetLibrary, missingAssets, resolverFor } from "./canvas-assets.ts";

function library(overrides: Partial<AssetLibrary> = {}): AssetLibrary {
  return {
    fonts: new Map([["font-a", new ArrayBuffer(8)]]),
    images: new Map([
      ["image-a", { url: "/api/v1/workspaces/w/images/image-a.png", width: 800, height: 600 }],
    ]),
    ...overrides,
  };
}

function document(elements: DesignDocument["elements"]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 100, background: "#FFFFFF" },
    elements,
  };
}

function text(fontAssetId: string, id = "t"): DesignDocument["elements"][number] {
  return {
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "HI",
    fontAssetId,
    fontSize: 20,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
  };
}

function image(src: string, id = "i"): DesignDocument["elements"][number] {
  return {
    id,
    type: "image",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    src,
    naturalWidth: 800,
    naturalHeight: 600,
    fitMode: "cover",
    clip: "none",
  };
}

test("the resolver answers the compiler from what was fetched", () => {
  const held = library();
  const resolver = resolverFor(held);

  expect(resolver.fontBytes("font-a").byteLength).toBe(8);
  expect(resolver.imageUrl("image-a")).toBe("/api/v1/workspaces/w/images/image-a.png");
  expect(resolver.imageSize("image-a")).toEqual({ width: 800, height: 600 });
});

test("an asset that was never fetched is a refusal, not an empty answer", () => {
  const resolver = resolverFor(library());

  expect(() => resolver.fontBytes("font-b")).toThrow('"font-b"');
  expect(() => resolver.imageUrl("image-b")).toThrow('"image-b"');
  expect(() => resolver.imageSize("image-b")).toThrow('"image-b"');
});

test("the assets a document wants and the library lacks are named, fonts and images alike", () => {
  const doc = document([text("font-a"), text("font-b", "second"), image("image-b")]);

  expect(missingAssets(doc, library())).toEqual(["font-b", "image-b"]);
});

test("a document whose assets are all in hand is missing nothing", () => {
  const doc = document([text("font-a"), image("image-a")]);

  expect(missingAssets(doc, library())).toEqual([]);
});

test("an Image Variable default is wanted for the preview even when src is bound", () => {
  const photo = image("image-a");
  if (photo.type !== "image") throw new Error("expected an image");
  const doc: DesignDocument = {
    ...document([{ ...photo, src: { $var: "hero" } }]),
    variables: [{ name: "hero", type: "image", default: "image-b" }],
  };

  expect(missingAssets(doc, library())).toEqual(["image-b"]);
});
