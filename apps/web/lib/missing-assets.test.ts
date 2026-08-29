import type { DesignDocument, Element, ImageElement, TextElement } from "@media-canvas/core";
import { expect, test } from "vitest";

import { createEditorStore } from "./editor-store.ts";
import { describeMissingAssets, replaceAssetReferences } from "./missing-assets.ts";

/**
 * The missing-asset panel, as pure decisions.
 *
 * Naming what is gone, listing the Elements that want it, and rewriting those
 * references as one Undo Entry are the rules the panel sits on. Fetching,
 * pickers, and mounting the preview are the canvas's job.
 */

test("a missing image is named and lists the elements that reference it", () => {
  const document = documentWith([
    image("hero", "gone", "Hero"),
    image("thumb", "gone", "Thumb"),
    image("ok", "present", "Present"),
  ]);

  expect(describeMissingAssets(document, ["gone"])).toEqual([
    { id: "gone", kind: "image", elementIds: ["hero", "thumb"], elementNames: ["Hero", "Thumb"] },
  ]);
});

test("replacing a deleted image once rewrites every element that pointed at it", () => {
  const document = documentWith([
    image("hero", "gone", "Hero"),
    image("thumb", "gone", "Thumb"),
    image("ok", "present", "Present"),
  ]);

  const replaced = replaceAssetReferences(document, "gone", "fresh");

  expect(replaced.elements).toMatchObject([
    { id: "hero", src: "fresh" },
    { id: "thumb", src: "fresh" },
    { id: "ok", src: "present" },
  ]);
  expect(replaced.elements[2]).toBe(document.elements[2]);
});

test("a missing font is named like a missing image, and several missing assets are listed at once", () => {
  const document = documentWith([
    text("title", "old-face", "Title"),
    text("body", "old-face", "Body"),
    image("hero", "gone", "Hero"),
  ]);

  expect(describeMissingAssets(document, ["old-face", "gone"])).toEqual([
    {
      id: "old-face",
      kind: "font",
      elementIds: ["title", "body"],
      elementNames: ["Title", "Body"],
    },
    { id: "gone", kind: "image", elementIds: ["hero"], elementNames: ["Hero"] },
  ]);
});

test("replacing a missing font rewrites every text element that used it", () => {
  const document = documentWith([text("title", "old-face", "Title"), text("body", "old-face")]);

  expect(replaceAssetReferences(document, "old-face", "inter").elements).toMatchObject([
    { id: "title", fontAssetId: "inter" },
    { id: "body", fontAssetId: "inter" },
  ]);
});

test("an unnamed element is listed by its type, including inside a group", () => {
  const document = documentWith([
    {
      id: "group",
      type: "group",
      name: "Card",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [image("nested", "gone"), text("caption", "old-face", "Caption")],
    },
  ]);

  expect(describeMissingAssets(document, ["gone", "old-face"])).toEqual([
    { id: "gone", kind: "image", elementIds: ["nested"], elementNames: ["image"] },
    {
      id: "old-face",
      kind: "font",
      elementIds: ["caption"],
      elementNames: ["Caption"],
    },
  ]);
  expect(replaceAssetReferences(document, "gone", "fresh").elements[0]).toMatchObject({
    children: [
      { id: "nested", src: "fresh" },
      { id: "caption", fontAssetId: "old-face" },
    ],
  });
});

test("a replacement is one Undo Entry", () => {
  const start = documentWith([image("hero", "gone", "Hero"), image("thumb", "gone", "Thumb")]);
  const store = createEditorStore(start);

  store
    .getState()
    .commitInspectorEdit(
      (document) => replaceAssetReferences(document, "gone", "fresh"),
      ["hero", "thumb"],
    );

  expect(store.getState().document?.elements).toMatchObject([{ src: "fresh" }, { src: "fresh" }]);
  store.getState().undo();
  expect(store.getState().document).toBe(start);
  expect(store.getState().selected).toEqual(["hero", "thumb"]);
  store.getState().redo();
  expect(store.getState().document?.elements).toMatchObject([{ src: "fresh" }, { src: "fresh" }]);
});

test("an Image Variable default is a reference that replacement rewrites", () => {
  const photo = image("hero", "placeholder");
  const document: DesignDocument = {
    ...documentWith([{ ...photo, src: { $var: "hero" } }]),
    variables: [{ name: "hero", type: "image", default: "gone" }],
  };

  expect(describeMissingAssets(document, ["gone"])).toEqual([
    { id: "gone", kind: "image", elementIds: [], elementNames: [] },
  ]);
  expect(replaceAssetReferences(document, "gone", "fresh").variables).toEqual([
    { name: "hero", type: "image", default: "fresh" },
  ]);
  expect(replaceAssetReferences(document, "gone", "fresh").elements[0]).toBe(document.elements[0]);
});

function documentWith(elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 100, background: "#FFFFFF" },
    elements,
  };
}

function image(id: string, src: string, name?: string): ImageElement {
  return {
    id,
    type: "image",
    name,
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

function text(id: string, fontAssetId: string, name?: string): TextElement {
  return {
    id,
    type: "text",
    name,
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
