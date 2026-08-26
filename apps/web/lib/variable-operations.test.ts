import type {
  DesignDocument,
  Element,
  ImageElement,
  RectElement,
  TextElement,
  VariableDecl,
} from "@media-canvas/core";
import { describe, expect, it } from "vitest";
import {
  bindNewVariable,
  bindProperty,
  createVariable,
  createVariableFromToken,
  deleteVariable,
  describeVariableUsage,
  isVariableName,
  matchingVariables,
  insertTokenName,
  openTokenQuery,
  renameToken,
  renameVariable,
  setVariableConstraints,
  setVariableDefault,
  tokenSuggestions,
  unbindProperty,
  unknownTokens,
  variableUsage,
} from "./variable-operations";

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

describe("Variable names", () => {
  it("must start with a letter and continue with letters, digits or underscores", () => {
    expect(isVariableName("2price")).toBe(false);
    expect(isVariableName("price_2")).toBe(true);
  });
});

describe("createVariable", () => {
  it("accepts price_2 and refuses 2price at creation", () => {
    const original = documentWith([]);

    const accepted = createVariable(original, { name: "price_2", type: "text" });
    const refused = createVariable(original, { name: "2price", type: "text" });

    expect(accepted).toEqual({
      ok: true,
      document: {
        ...original,
        variables: [{ name: "price_2", type: "text" }],
      },
    });
    expect(refused).toEqual({ ok: false, reason: "invalid_name" });
  });

  it("refuses a name that already exists, case-sensitively", () => {
    const original = documentWith([], [{ name: "price", type: "number" }]);

    expect(createVariable(original, { name: "price", type: "text" })).toEqual({
      ok: false,
      reason: "collision",
    });
    expect(createVariable(original, { name: "Price", type: "text" }).ok).toBe(true);
  });
});

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

describe("renameVariable", () => {
  it("rewrites a bound fill and every {{old}} token together", () => {
    const fill = rect("box", { $var: "old" });
    const headline = text("headline", "Price: {{old}}");
    const untouched = rect("other");
    const original = documentWith(
      [fill, headline, untouched],
      [
        { name: "old", type: "color", default: "#0055FF" },
        { name: "keep", type: "text" },
      ],
    );

    const renamed = renameVariable(original, "old", "new");

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error("expected a rename");
    expect(renamed.document.variables).toEqual([
      { name: "new", type: "color", default: "#0055FF" },
      { name: "keep", type: "text" },
    ]);
    expect(renamed.document.elements[0]).toMatchObject({ fill: { $var: "new" } });
    expect(renamed.document.elements[1]).toMatchObject({ content: "Price: {{new}}" });
    expect(renamed.document.elements[2]).toBe(untouched);
    expect(renamed.document.elements[1]).not.toBe(headline);
  });

  it("refuses a colliding name and an illegal name, and leaves the document as it was", () => {
    const original = documentWith(
      [text("headline", "{{old}}")],
      [
        { name: "old", type: "text" },
        { name: "taken", type: "text" },
      ],
    );

    expect(renameVariable(original, "old", "taken")).toEqual({
      ok: false,
      reason: "collision",
    });
    expect(renameVariable(original, "old", "2price")).toEqual({
      ok: false,
      reason: "invalid_name",
    });
    expect(original.variables?.map((variable) => variable.name)).toEqual(["old", "taken"]);
    expect((original.elements[0] as TextElement).content).toBe("{{old}}");
  });
});

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

describe("deleteVariable", () => {
  it("writes the current default back onto every bound property and leaves tokens in text", () => {
    const box = rect("box", { $var: "brand" });
    const photo = image("photo", { $var: "hero" });
    const headline = text("headline", "Price: {{old}}", { $var: "brand" });
    const original = documentWith(
      [box, photo, headline],
      [
        { name: "brand", type: "color", default: "#0055FF" },
        { name: "hero", type: "image", default: "6f1d0c2a" },
        { name: "old", type: "text", default: "4.99" },
      ],
      { $var: "brand" },
    );

    const deleted = deleteVariable(original, "brand");

    expect(deleted.variables).toEqual([
      { name: "hero", type: "image", default: "6f1d0c2a" },
      { name: "old", type: "text", default: "4.99" },
    ]);
    expect(deleted.canvas.background).toBe("#0055FF");
    expect(deleted.elements[0]).toMatchObject({ fill: "#0055FF" });
    expect(deleted.elements[1]).toBe(photo);
    expect(deleted.elements[2]).toMatchObject({
      content: "Price: {{old}}",
      color: "#0055FF",
    });
    expect((deleted.elements[2] as TextElement).content).toBe("Price: {{old}}");

    const withoutHero = deleteVariable(deleted, "hero");
    expect(withoutHero.elements[1]).toMatchObject({ src: "6f1d0c2a" });
    expect((withoutHero.elements[2] as TextElement).content).toBe("Price: {{old}}");
  });

  it("counts bound properties and text elements so a dead Variable is visible", () => {
    const original = documentWith(
      [
        rect("box", { $var: "brand" }),
        text("one", "{{old}} now {{old}}"),
        text("two", "{{old}}"),
        text("three", "plain"),
      ],
      [
        { name: "brand", type: "color", default: "#0055FF" },
        { name: "old", type: "text" },
        { name: "unused", type: "number" },
      ],
      { $var: "brand" },
    );

    expect(variableUsage(original, "brand")).toEqual({ properties: 2, textElements: 0 });
    expect(variableUsage(original, "old")).toEqual({ properties: 0, textElements: 2 });
    expect(variableUsage(original, "unused")).toEqual({ properties: 0, textElements: 0 });
    expect(describeVariableUsage(variableUsage(original, "brand"))).toBe("bound to 2 properties.");
    expect(describeVariableUsage({ properties: 3, textElements: 2 })).toBe(
      "bound to 3 properties, used in 2 text elements.",
    );
    expect(describeVariableUsage(variableUsage(original, "unused"))).toBe(
      "Nothing references this Variable.",
    );
  });
});

describe("Variable defaults and constraints", () => {
  it("edits the default and the text length bounds without changing the type", () => {
    const original = documentWith([], [{ name: "headline", type: "text" }]);

    const withDefault = setVariableDefault(original, "headline", "Sale");
    const withBounds = setVariableConstraints(withDefault, "headline", {
      minLength: 1,
      maxLength: 40,
    });

    expect(withBounds.variables).toEqual([
      {
        name: "headline",
        type: "text",
        default: "Sale",
        constraints: { minLength: 1, maxLength: 40 },
      },
    ]);
    expect(original.variables?.[0]).toEqual({ name: "headline", type: "text" });
  });
});

describe("bind and unbind", () => {
  it("seeds a new color Variable with the fill that was already there", () => {
    const box = rect("box", "#0055FF");
    const original = documentWith([box], []);

    const bound = bindNewVariable(original, { site: "fill", elementId: "box" }, "brand");

    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error("expected a bind");
    expect(bound.document.variables).toEqual([
      { name: "brand", type: "color", default: "#0055FF" },
    ]);
    expect(bound.document.elements[0]).toMatchObject({ fill: { $var: "brand" } });
    expect(bound.document.elements[0]).not.toBe(box);
  });

  it("offers only Variables of the matching type", () => {
    const original = documentWith(
      [rect("box", "#0055FF"), image("photo", "6f1d0c2a")],
      [
        { name: "brand", type: "color", default: "#112233" },
        { name: "hero", type: "image", default: "6f1d0c2a" },
        { name: "shown", type: "boolean", default: true },
        { name: "price", type: "text" },
      ],
    );

    expect(matchingVariables(original, "color").map((variable) => variable.name)).toEqual([
      "brand",
    ]);
    expect(matchingVariables(original, "image").map((variable) => variable.name)).toEqual(["hero"]);
    expect(matchingVariables(original, "boolean").map((variable) => variable.name)).toEqual([
      "shown",
    ]);
  });

  it("binds an existing Variable and unbinds by writing the default back", () => {
    const box = rect("box", "#000000");
    const original = documentWith([box], [{ name: "brand", type: "color", default: "#0055FF" }]);

    const bound = bindProperty(original, { site: "fill", elementId: "box" }, "brand");
    expect(bound.elements[0]).toMatchObject({ fill: { $var: "brand" } });

    const unbound = unbindProperty(bound, { site: "fill", elementId: "box" });
    expect(unbound.elements[0]).toMatchObject({ fill: "#0055FF" });
    expect(unbound.elements[0]).not.toBe(bound.elements[0]);
  });

  it("binds image source, visibility, and every solid colour site, and unbinds to the default", () => {
    const box: RectElement = {
      ...rect("box", "#112233"),
      border: { color: "#AABBCC", width: 1 },
      visible: false,
    };
    const photo = image("photo", "6f1d0c2a");
    const headline = text("headline", "Hi", "#010101");
    const original = documentWith([box, photo, headline], [], "#FFFFFF");

    const src = bindNewVariable(original, { site: "imageSrc", elementId: "photo" }, "hero");
    expect(src.ok).toBe(true);
    if (!src.ok) throw new Error("expected a bind");
    expect(src.document.variables).toEqual([{ name: "hero", type: "image", default: "6f1d0c2a" }]);
    expect(src.document.elements[1]).toMatchObject({ src: { $var: "hero" } });
    expect(
      unbindProperty(src.document, { site: "imageSrc", elementId: "photo" }).elements[1],
    ).toMatchObject({ src: "6f1d0c2a" });

    const shown = bindNewVariable(original, { site: "visible", elementId: "box" }, "shown");
    expect(shown.ok).toBe(true);
    if (!shown.ok) throw new Error("expected a bind");
    expect(shown.document.variables).toEqual([{ name: "shown", type: "boolean", default: false }]);
    expect(
      unbindProperty(shown.document, { site: "visible", elementId: "box" }).elements[0],
    ).toMatchObject({ visible: false });

    const background = bindNewVariable(original, { site: "background" }, "paper");
    expect(background.ok).toBe(true);
    if (!background.ok) throw new Error("expected a bind");
    expect(background.document.variables).toEqual([
      { name: "paper", type: "color", default: "#FFFFFF" },
    ]);
    expect(unbindProperty(background.document, { site: "background" }).canvas.background).toBe(
      "#FFFFFF",
    );

    const color = bindNewVariable(original, { site: "textColor", elementId: "headline" }, "ink");
    expect(color.ok).toBe(true);
    if (!color.ok) throw new Error("expected a bind");
    expect(color.document.variables).toEqual([{ name: "ink", type: "color", default: "#010101" }]);
    expect(
      unbindProperty(color.document, { site: "textColor", elementId: "headline" }).elements[2],
    ).toMatchObject({ color: "#010101" });

    const border = bindNewVariable(original, { site: "borderColor", elementId: "box" }, "stroke");
    expect(border.ok).toBe(true);
    if (!border.ok) throw new Error("expected a bind");
    expect(border.document.variables).toEqual([
      { name: "stroke", type: "color", default: "#AABBCC" },
    ]);
    expect(
      unbindProperty(border.document, { site: "borderColor", elementId: "box" }).elements[0],
    ).toMatchObject({ border: { color: "#AABBCC", width: 1 } });
  });

  it("switches a bound fill to another Variable of the same type", () => {
    const original = documentWith(
      [rect("box", { $var: "brand" })],
      [
        { name: "brand", type: "color", default: "#0055FF" },
        { name: "accent", type: "color", default: "#FF0000" },
      ],
    );

    const switched = bindProperty(original, { site: "fill", elementId: "box" }, "accent");
    expect(switched.elements[0]).toMatchObject({ fill: { $var: "accent" } });
  });
});

describe("Unknown Tokens", () => {
  it("names the unknown token and the text that holds it when only price is declared", () => {
    const original = documentWith(
      [text("headline", "Now {{prce}}")],
      [{ name: "price", type: "text" }],
    );

    expect(unknownTokens(original)).toEqual([{ name: "prce", elementIds: ["headline"] }]);
  });

  it("creates the missing Variable or renames the token to an existing one", () => {
    const original = documentWith(
      [text("headline", "Now {{prce}}")],
      [{ name: "price", type: "text" }],
    );

    const created = createVariableFromToken(original, "prce");
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected a create");
    expect(created.document.variables).toEqual([
      { name: "price", type: "text" },
      { name: "prce", type: "text" },
    ]);
    expect(unknownTokens(created.document)).toEqual([]);

    const renamed = renameToken(original, "prce", "price");
    expect(renamed.elements[0]).toMatchObject({ content: "Now {{price}}" });
    expect(unknownTokens(renamed)).toEqual([]);
  });
});

describe("token autocomplete", () => {
  it("offers declared text and number Variables after {{, and inserts nothing", () => {
    const variables: VariableDecl[] = [
      { name: "price", type: "text" },
      { name: "qty", type: "number" },
      { name: "brand", type: "color" },
    ];

    expect(openTokenQuery("Now {{", 6)).toEqual({ start: 4, query: "" });
    expect(tokenSuggestions("", variables)).toEqual(["price", "qty"]);
    expect(openTokenQuery("Now {{pr", 8)).toEqual({ start: 4, query: "pr" });
    expect(tokenSuggestions("pr", variables)).toEqual(["price"]);
    expect(openTokenQuery("Now {{price}}", 13)).toBeNull();
    expect(openTokenQuery("Now ", 4)).toBeNull();
    expect(insertTokenName("Now {{", 6, "price")).toEqual({
      content: "Now {{price}}",
      cursor: 13,
    });
    expect(insertTokenName("Now {{prce}}", 8, "price")).toEqual({
      content: "Now {{price}}",
      cursor: 13,
    });
  });
});
