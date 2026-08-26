import type {
  DesignDocument,
  Element,
  ImageElement,
  RectElement,
  TextElement,
  VariableDecl,
} from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import { previewDocument } from "./preview-document";

function documentWith(
  elements: Element[],
  variables?: VariableDecl[],
  background: DesignDocument["canvas"]["background"] = "#FFFFFF",
): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background },
    ...(variables === undefined ? {} : { variables }),
    elements,
  };
}

function rect(id: string, fill: RectElement["fill"] = "#000000"): RectElement {
  return {
    id,
    type: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill,
  };
}

function image(id: string, src: ImageElement["src"]): ImageElement {
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
    naturalWidth: 40,
    naturalHeight: 40,
    fitMode: "cover",
    clip: "none",
  };
}

function text(id: string, content: string, color: TextElement["color"] = "#000000"): TextElement {
  return {
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    content,
    fontAssetId: "font",
    fontSize: 16,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color,
  };
}

describe("previewDocument", () => {
  it("shows each Variable's default, and the value-rule neutrals when there is none", () => {
    const untouched = rect("other");
    const original = documentWith(
      [
        { ...rect("branded", { $var: "brand" }), visible: { $var: "shown" } },
        image("photo", { $var: "hero" }),
        text("headline", "Now {{price}} {{missing}}"),
        untouched,
      ],
      [
        { name: "brand", type: "color", default: "#0055FF" },
        { name: "shown", type: "boolean" },
        { name: "hero", type: "image" },
        { name: "price", type: "text", default: "4.99" },
        { name: "missing", type: "text" },
      ],
    );

    const previewed = previewDocument(original);

    expect(previewed.variables).toBeUndefined();
    expect(previewed.elements[0]).toMatchObject({ fill: "#0055FF", visible: true });
    expect(previewed.elements[1]).toMatchObject({ type: "rect", fill: "#808080" });
    expect(previewed.elements[2]).toMatchObject({ content: "Now 4.99 {{missing}}" });
    expect(previewed.elements[3]).toBe(untouched);
  });

  it("keeps the raw content of a text Element that is being edited", () => {
    const original = documentWith(
      [text("headline", "Now {{price}}")],
      [{ name: "price", type: "text", default: "4.99" }],
    );

    expect(previewDocument(original, "headline").elements[0]).toMatchObject({
      content: "Now {{price}}",
    });
  });
});
