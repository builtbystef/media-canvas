import { expect, test } from "vitest";

import type { DesignDocument } from "./index.ts";
import { validateDocument } from "./index.ts";

function validDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 1080, height: 1080, background: "#FFFFFF" },
    elements: [
      {
        id: "backdrop",
        name: "Backdrop",
        type: "rect",
        x: 0,
        y: 0,
        width: 1080,
        height: 1080,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: {
          type: "linear",
          angle: 90,
          stops: [
            { offset: 0, color: "#000000" },
            { offset: 1, color: "#ffffff80" },
          ],
        },
        cornerRadius: { topLeft: 20, topRight: 0, bottomRight: 0, bottomLeft: 8 },
        border: { color: "#123456", width: 2 },
        shadow: { dx: 0, dy: 4, blur: 12, color: "#00000080", opacity: 0.5 },
      },
      {
        id: "dot",
        type: "ellipse",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
        rotation: 45,
        opacity: 0.9,
        visible: true,
        fill: { type: "radial", stops: [{ offset: 0.25, color: "#FF0000" }] },
      },
      {
        id: "arrow",
        type: "vector",
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        rotation: 0,
        opacity: 1,
        visible: true,
        path: "M0 0 L24 12 L0 24 Z",
        viewBox: { width: 24, height: 24 },
        fill: "#0055FF",
        border: { color: "#000000", width: 1 },
      },
      {
        id: "photo",
        type: "image",
        x: 0,
        y: 200,
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
        clip: "ellipse",
        cornerRadius: 12,
      },
      {
        id: "headline",
        type: "text",
        x: 40,
        y: 700,
        width: 1000,
        rotation: 0,
        opacity: 1,
        visible: true,
        content: "LIMITED OFFER",
        fontAssetId: "a1b2c3",
        fontSize: 30,
        lineHeight: 1.2,
        letterSpacing: 0,
        align: "center",
        anchor: "middle",
        color: "#111111",
        shadow: { dx: 1, dy: 1, blur: 0, color: "#000000", opacity: 0.25 },
      },
      {
        id: "badge",
        type: "group",
        x: 800,
        y: 40,
        rotation: 0,
        opacity: 1,
        visible: true,
        children: [
          {
            id: "badge-bg",
            type: "rect",
            x: 0,
            y: 0,
            width: 200,
            height: 80,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: "#FF0000",
            cornerRadius: 40,
          },
        ],
      },
    ],
  };
}

function documentWith(elements: unknown[], variables?: unknown[]): unknown {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    ...(variables === undefined ? {} : { variables }),
    elements,
  };
}

function rect(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "r",
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

function text(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "t",
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

test("a document using every element type and property is valid", () => {
  expect(validateDocument(validDocument())).toEqual([]);
});

test("schemaVersion must be the integer 1", () => {
  const errors = validateDocument({ ...validDocument(), schemaVersion: 2 });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).toContain("schemaVersion");
});

test("element ids are unique across the whole tree, groups included", () => {
  const group = {
    id: "g",
    type: "group",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    children: [rect({ id: "a" })],
  };

  const errors = validateDocument(documentWith([group, rect({ id: "a" })]));

  expect(errors).toHaveLength(1);
  expect(errors[0]?.elementId).toBe("a");
  expect(errors[0]?.message).toContain("duplicate element id");
});

test("a content token naming no declared Variable is an error naming the token and the element", () => {
  const variables = [{ name: "price", type: "text" }];

  const errors = validateDocument(
    documentWith([text({ id: "headline", content: "Now {{prce}}" })], variables),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("prce");
  expect(errors[0]?.elementId).toBe("headline");
});

test("a content token naming a declared Variable is valid", () => {
  const variables = [{ name: "price", type: "text" }];

  expect(validateDocument(documentWith([text({ content: "Now {{price}}" })], variables))).toEqual(
    [],
  );
});

test("a Variable reference naming no declared Variable is an error", () => {
  const errors = validateDocument(documentWith([rect({ id: "box", fill: { $var: "brand" } })]));

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("brand");
  expect(errors[0]?.elementId).toBe("box");
});

test("colors are #RRGGBB or #RRGGBBAA, and nothing else", () => {
  expect(validateDocument(documentWith([rect({ fill: "#FFFFFF" })]))).toEqual([]);
  expect(validateDocument(documentWith([rect({ fill: "#ffffff80" })]))).toEqual([]);

  for (const bad of ["#fff", "red"]) {
    const errors = validateDocument(documentWith([rect({ id: "box", fill: bad })]));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.elementId).toBe("box");
  }
});

test("opacity, shadow opacity, and gradient stop offsets run 0..1", () => {
  const cases: Record<string, unknown>[] = [
    { opacity: 1.5 },
    { shadow: { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 1.5 } },
    { fill: { type: "radial", stops: [{ offset: 1.5, color: "#000000" }] } },
  ];

  for (const overrides of cases) {
    const errors = validateDocument(documentWith([rect({ id: "box", ...overrides })]));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.elementId).toBe("box");
  }
});

test("widths and heights are non-negative", () => {
  const errors = validateDocument(documentWith([rect({ id: "box", width: -1 })]));

  expect(errors).toHaveLength(1);
  expect(errors[0]?.elementId).toBe("box");
});

test("a Variable reference is valid only where v1 permits one", () => {
  const variables = [
    { name: "brand", type: "color" },
    { name: "shown", type: "boolean" },
    { name: "photo", type: "image" },
  ];

  expect(
    validateDocument(
      documentWith([rect({ fill: { $var: "brand" }, visible: { $var: "shown" } })], variables),
    ),
  ).toEqual([]);

  const forbidden: Record<string, unknown>[] = [
    { fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: { $var: "brand" } }] } },
    { width: { $var: "brand" } },
  ];
  for (const overrides of forbidden) {
    const errors = validateDocument(documentWith([rect({ id: "box", ...overrides })], variables));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.elementId).toBe("box");
  }

  const fontRef = validateDocument(
    documentWith([text({ id: "headline", fontAssetId: { $var: "brand" } })], variables),
  );
  expect(fontRef).toHaveLength(1);
  expect(fontRef[0]?.elementId).toBe("headline");
  expect(fontRef[0]?.message).toContain("Variable reference is not permitted here");
});

test("a malformed Variable reference at a permitted site reports the reference, not the site", () => {
  const errors = validateDocument(documentWith([rect({ id: "box", fill: { $var: "" } })]));

  expect(errors).toHaveLength(1);
  expect(errors[0]?.elementId).toBe("box");
  expect(errors[0]?.message).toContain("must not be empty");
});

test("a document with no variables is valid", () => {
  const document = validDocument();
  expect(document.variables).toBeUndefined();
  expect(validateDocument(document)).toEqual([]);
});

test("Variable names are unique", () => {
  const variables = [
    { name: "price", type: "text" },
    { name: "price", type: "number" },
  ];

  const errors = validateDocument(documentWith([rect()], variables));

  expect(errors).toHaveLength(1);
  expect(errors[0]?.variable).toBe("price");
  expect(errors[0]?.message).toContain("duplicate Variable name");
});

test("a Variable's declared default matches its declared type", () => {
  const valid = [
    { name: "headline", type: "text", default: "Sale", constraints: { minLength: 1 } },
    { name: "price", type: "number", default: 4.99 },
    { name: "shown", type: "boolean", default: true },
    { name: "brand", type: "color", default: "#0055FFAA" },
    { name: "photo", type: "image", default: "6f1d0c2a" },
  ];
  expect(validateDocument(documentWith([rect()], valid))).toEqual([]);

  for (const declaration of [
    { name: "price", type: "number", default: "4.99" },
    { name: "shown", type: "boolean", default: "true" },
    { name: "brand", type: "color", default: "blue" },
    { name: "headline", type: "text", default: 5 },
  ]) {
    const errors = validateDocument(documentWith([rect()], [declaration]));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.variable).toBe(declaration.name);
  }
});

test("a Variable's declared type must suit every site that references it", () => {
  const variables = [
    { name: "brand", type: "color" },
    { name: "shown", type: "boolean" },
    { name: "photo", type: "image" },
    { name: "headline", type: "text" },
    { name: "price", type: "number" },
  ];

  expect(
    validateDocument(
      documentWith(
        [
          rect({ fill: { $var: "brand" }, visible: { $var: "shown" } }),
          text({ content: "{{headline}}: {{price}}", color: { $var: "brand" } }),
        ],
        variables,
      ),
    ),
  ).toEqual([]);

  const mismatched: Record<string, unknown>[] = [
    { fill: { $var: "price" } },
    { visible: { $var: "headline" } },
    { border: { color: { $var: "photo" }, width: 1 } },
  ];
  for (const overrides of mismatched) {
    const errors = validateDocument(documentWith([rect({ id: "box", ...overrides })], variables));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.elementId).toBe("box");
  }

  const token = validateDocument(
    documentWith([text({ id: "headline", content: "{{brand}}" })], variables),
  );
  expect(token).toHaveLength(1);
  expect(token[0]?.variable).toBe("brand");
});
