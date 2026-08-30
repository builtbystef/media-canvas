import { expect, test } from "vitest";

import type {
  DesignDocument,
  Element,
  ImageElement,
  RectElement,
  TextElement,
  VariableDecl,
} from "./index.ts";
import { resolve, validate } from "./index.ts";

function template(variables: VariableDecl[], elements: Element[] = []): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    variables,
    elements,
  };
}

function rect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: "box",
    type: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#000000",
    ...overrides,
  };
}

function image(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: "photo",
    type: "image",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    visible: true,
    src: "6f1d0c2a",
    naturalWidth: 800,
    naturalHeight: 600,
    content: { offsetX: -20, offsetY: 0, scale: 1.2 },
    fitMode: "cover",
    clip: "none",
    ...overrides,
  };
}

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "headline",
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "hello",
    fontAssetId: "a1b2c3",
    fontSize: 16,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
    ...overrides,
  };
}

test("an omitted value takes its default, and omitted with no default names the Variable", () => {
  const headline: VariableDecl = { name: "headline", type: "text", default: "Sale" };
  const price: VariableDecl = { name: "price", type: "number" };

  const errors = validate(template([headline, price]), {});

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("price");
});

test("types are strict, with no coercion", () => {
  const cases: [VariableDecl, unknown][] = [
    [{ name: "shown", type: "boolean" }, "true"],
    [{ name: "price", type: "number" }, "5"],
    [{ name: "headline", type: "text" }, 5],
    [{ name: "brand", type: "color" }, "blue"],
    [{ name: "brand", type: "color" }, "#fff"],
  ];

  for (const [declaration, value] of cases) {
    const errors = validate(template([declaration]), { [declaration.name]: value });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.variable).toBe(declaration.name);
  }

  expect(validate(template([{ name: "brand", type: "color" }]), { brand: "#0055FFAA" })).toEqual(
    [],
  );
});

test("an image value is an Image Asset id or an http(s) URL, and nothing else", () => {
  const photo: VariableDecl = { name: "photo", type: "image" };

  for (const value of ["6f1d0c2a", "http://example.com/a.png", "https://cdn.example.com/a.png"]) {
    expect(validate(template([photo]), { photo: value })).toEqual([]);
  }

  for (const value of [
    "",
    "an id with spaces",
    "data:image/png;base64,AAAA",
    "ftp://example.com/a.png",
    "file:///etc/passwd",
    5,
  ]) {
    const errors = validate(template([photo]), { photo: value });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.variable).toBe("photo");
  }
});

test("an empty string is a legal text value, unless minLength forbids it", () => {
  const free: VariableDecl = { name: "headline", type: "text" };
  expect(validate(template([free]), { headline: "" })).toEqual([]);

  const required: VariableDecl = { name: "headline", type: "text", constraints: { minLength: 1 } };
  const errors = validate(template([required]), { headline: "" });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("headline");
});

test("a text value longer than maxLength is an error naming the Variable", () => {
  const capped: VariableDecl = { name: "headline", type: "text", constraints: { maxLength: 5 } };

  expect(validate(template([capped]), { headline: "Sale!" })).toEqual([]);

  const errors = validate(template([capped]), { headline: "Sale!!" });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("headline");
});

test("an explicit null is a type error for every Variable type, never an omission", () => {
  const declarations: VariableDecl[] = [
    { name: "headline", type: "text", default: "Sale" },
    { name: "price", type: "number", default: 1 },
    { name: "shown", type: "boolean", default: true },
    { name: "brand", type: "color", default: "#000000" },
    { name: "photo", type: "image", default: "6f1d0c2a" },
  ];

  for (const declaration of declarations) {
    const errors = validate(template([declaration]), { [declaration.name]: null });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.variable).toBe(declaration.name);
  }
});

test("validating values also reports what is wrong with the Template itself", () => {
  const headline = text({ id: "headline", content: "Now {{prce}}" });
  const invalid = template([{ name: "price", type: "number" }], [headline]);

  const errors = validate(invalid, { price: 4.99 });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("prce");
  expect(errors[0]?.elementId).toBe("headline");
});

test("resolving leaves no Variable declarations and no Variable references behind", () => {
  const design = template(
    [
      { name: "brand", type: "color" },
      { name: "shown", type: "boolean" },
      { name: "price", type: "number" },
    ],
    [
      rect({ fill: { $var: "brand" }, visible: { $var: "shown" } }),
      text({ content: "Price: {{price}}", color: { $var: "brand" } }),
    ],
  );
  design.canvas.background = { $var: "brand" };

  const resolved = resolve(design, { brand: "#0055FF", shown: false, price: 4.99 });

  expect(resolved.variables).toBeUndefined();
  expect(resolved.canvas.background).toBe("#0055FF");
  const box = resolved.elements[0] as RectElement;
  expect(box.fill).toBe("#0055FF");
  expect(box.visible).toBe(false);
  const headline = resolved.elements[1] as TextElement;
  expect(headline.content).toBe("Price: 4.99");
  expect(headline.color).toBe("#0055FF");
});

test("a number token interpolates the way JavaScript spells the number", () => {
  const design = template(
    [{ name: "price", type: "number" }],
    [text({ content: "Price: {{price}}" })],
  );

  const cents = resolve(design, { price: 4.99 }).elements[0] as TextElement;
  const round = resolve(design, { price: 4.9 }).elements[0] as TextElement;

  expect(cents.content).toBe("Price: 4.99");
  expect(round.content).toBe("Price: 4.9");
});

test("an omitted value resolves to the Variable's declared default", () => {
  const design = template(
    [
      { name: "headline", type: "text", default: "Sale" },
      { name: "brand", type: "color", default: "#0055FF" },
    ],
    [text({ content: "{{headline}}", color: { $var: "brand" } })],
  );

  const headline = resolve(design, {}).elements[0] as TextElement;

  expect(headline.content).toBe("Sale");
  expect(headline.color).toBe("#0055FF");
});

test("an image whose source came from a Variable loses its authored crop", () => {
  const design = template(
    [{ name: "photo", type: "image" }],
    [image({ id: "bound", src: { $var: "photo" } }), image({ id: "authored" })],
  );

  const resolved = resolve(design, { photo: "0011aabb" });

  const bound = resolved.elements[0] as ImageElement;
  expect(bound.src).toBe("0011aabb");
  expect("content" in bound).toBe(false);
  const authored = resolved.elements[1] as ImageElement;
  expect(authored.content).toEqual({ offsetX: -20, offsetY: 0, scale: 1.2 });
});

test("resolving values that validation would have rejected throws rather than drawing them", () => {
  const design = template(
    [{ name: "price", type: "number" }],
    [text({ content: "Price: {{price}}" })],
  );

  expect(() => resolve(design, {})).toThrow(/price/);
});

test("a preview fills the Variables that have neither a value nor a default", () => {
  const design = template(
    [
      { name: "headline", type: "text" },
      { name: "price", type: "number" },
      { name: "brand", type: "color" },
      { name: "shown", type: "boolean" },
      { name: "photo", type: "image" },
    ],
    [
      text({
        content: "{{headline}} {{price}}",
        color: { $var: "brand" },
        visible: { $var: "shown" },
      }),
      image({ id: "photo", src: { $var: "photo" } }),
    ],
  );

  const resolved = resolve(design, {}, "preview");

  const headline = resolved.elements[0] as TextElement;
  expect(headline.content).toBe("{{headline}} {{price}}");
  expect(headline.color).toBe("#808080");
  expect(headline.visible).toBe(true);
  const photo = resolved.elements[1] as RectElement;
  expect(photo.type).toBe("rect");
  expect(photo.fill).toBe("#808080");
  expect(photo.id).toBe("photo");
  expect(photo.width).toBe(400);
  expect(photo.height).toBe(400);
});
