import type { FontAssetView } from "@media-canvas/api-client";
import type { DesignDocument, Element, ImageElement, TextElement } from "@media-canvas/core";
import { expect, test } from "vitest";

import {
  countAssetUsages,
  describeAssetDeletion,
  finishFontUpload,
  fontsForPanel,
  groupFontsForPicker,
} from "./assets.ts";

function font(
  partial: Partial<FontAssetView> & Pick<FontAssetView, "id" | "family">,
): FontAssetView {
  return {
    format: "ttf",
    subfamily: "Regular",
    weight: 400,
    italic: false,
    postscriptName: `${partial.family}-Regular`,
    byteSize: 1000,
    bundled: false,
    originalFilename: `${partial.family}.ttf`,
    createdAt: "2026-08-01T00:00:00Z",
    url: `/api/v1/workspaces/w/fonts/${partial.id}`,
    ...partial,
  };
}

test("the picker groups faces under their family, with bundled families first", () => {
  const uploaded = font({
    id: "uploaded-regular",
    family: "Custom",
    subfamily: "Regular",
    createdAt: "2026-08-20T00:00:00Z",
  });
  const interBold = font({
    id: "inter-bold",
    family: "Inter",
    subfamily: "Bold",
    weight: 700,
    bundled: true,
    postscriptName: "Inter-Bold",
  });
  const interRegular = font({
    id: "inter-regular",
    family: "Inter",
    subfamily: "Regular",
    bundled: true,
    postscriptName: "Inter-Regular",
  });
  const montserrat = font({
    id: "montserrat-regular",
    family: "Montserrat",
    bundled: true,
    postscriptName: "Montserrat-Regular",
  });

  expect(groupFontsForPicker([uploaded, interBold, montserrat, interRegular])).toEqual([
    { family: "Inter", bundled: true, faces: [interRegular, interBold] },
    { family: "Montserrat", bundled: true, faces: [montserrat] },
    { family: "Custom", bundled: false, faces: [uploaded] },
  ]);
});

test("the panel groups bundled fonts together and leaves uploaded fonts after them", () => {
  const uploadedNew = font({
    id: "uploaded-new",
    family: "Custom",
    createdAt: "2026-08-20T00:00:00Z",
  });
  const uploadedOld = font({
    id: "uploaded-old",
    family: "Other",
    createdAt: "2026-08-10T00:00:00Z",
  });
  const interBold = font({
    id: "inter-bold",
    family: "Inter",
    subfamily: "Bold",
    weight: 700,
    bundled: true,
  });
  const interRegular = font({
    id: "inter-regular",
    family: "Inter",
    bundled: true,
  });
  const montserrat = font({
    id: "montserrat-regular",
    family: "Montserrat",
    bundled: true,
  });

  expect(fontsForPanel([uploadedNew, interBold, uploadedOld, montserrat, interRegular])).toEqual({
    bundled: [interRegular, interBold, montserrat],
    uploaded: [uploadedNew, uploadedOld],
  });
});

const GENERIC_DELETION =
  "Any design or template using this will fail to render until it is replaced.";

test("deleting an asset used by three elements in the open document says so", () => {
  const document = documentWith([
    image("one", "photo"),
    image("two", "photo"),
    image("three", "photo"),
    image("other", "elsewhere"),
  ]);

  expect(countAssetUsages(document, "photo")).toBe(3);
  expect(describeAssetDeletion(3)).toBe(`Used by 3 elements in this document. ${GENERIC_DELETION}`);
});

test("an asset used only by another document gets the generic warning", () => {
  const document = documentWith([image("one", "photo"), text("headline", "inter")]);

  expect(countAssetUsages(document, "missing")).toBe(0);
  expect(describeAssetDeletion(0)).toBe(GENERIC_DELETION);
});

test("usages are counted inside groups and across fonts and images", () => {
  const document = documentWith([
    {
      id: "group",
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [text("inside", "inter"), image("nested", "photo")],
    },
    text("outside", "inter"),
  ]);

  expect(countAssetUsages(document, "inter")).toBe(2);
  expect(countAssetUsages(document, "photo")).toBe(1);
  expect(describeAssetDeletion(1)).toBe(`Used by 1 element in this document. ${GENERIC_DELETION}`);
});

test("uploading a font from the picker selects the new face", () => {
  const uploaded = font({ id: "new-face", family: "Custom", subfamily: "Medium", weight: 500 });

  expect(finishFontUpload({ ok: true, font: uploaded })).toEqual({
    kind: "selected",
    font: uploaded,
  });
});

test("a rejected picker upload shows the refusal's own words and adds no font", () => {
  const message =
    "This is a variable font, and text measured from one is unreliable. " +
    "Export the static instances you need from it, and upload those.";

  expect(
    finishFontUpload({
      ok: false,
      error: { error: { code: "variable_font", message } },
    }),
  ).toEqual({ kind: "rejected", message });
});

function documentWith(elements: Element[]): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 100, background: "#FFFFFF" },
    elements,
  };
}

function image(id: string, src: string): ImageElement {
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

function text(id: string, fontAssetId: string): TextElement {
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
