import { expect, test } from "vitest";

import type {
  AssetResolver,
  DesignDocument,
  Element,
  EllipseElement,
  Fill,
  RectElement,
  VarRef,
  VectorElement,
} from "./index.ts";
import { compile } from "./index.ts";

/** The rect, ellipse, and vector elements of this slice consult no asset, so a
 *  resolver that refuses every call proves they never reach for one. */
function assets(): AssetResolver {
  return {
    fontBytes() {
      throw new Error("no font asset expected");
    },
    imageUrl() {
      throw new Error("no image asset expected");
    },
    imageSize() {
      throw new Error("no image asset expected");
    },
  };
}

function document(elements: Element[], background: Fill | VarRef = "#FFFFFF"): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 200, height: 100, background },
    elements,
  };
}

function rect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: "r",
    type: "rect",
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#FF0000",
    ...overrides,
  };
}

function svg(...lines: string[]): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">',
    ...lines,
    "</svg>",
  ].join("\n");
}

test("an svg sized to the canvas paints the background, then the elements in document order", () => {
  const compiled = compile(
    document([
      rect({ id: "bottom", fill: "#FF0000" }),
      rect({ id: "top", x: 10, y: 5, fill: "#0000FF" }),
    ]),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<rect x="0" y="0" width="40" height="20" fill="#FF0000"/>',
      '<rect x="10" y="5" width="40" height="20" fill="#0000FF"/>',
    ),
  );
});

test("a uniform corner radius stays a rect", () => {
  const compiled = compile(document([rect({ cornerRadius: 20 })]), assets());

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<rect x="0" y="0" width="40" height="20" rx="20" fill="#FF0000"/>',
    ),
  );
});

test("a corner radius of zero leaves the rect unrounded", () => {
  const compiled = compile(document([rect({ cornerRadius: 0 })]), assets());

  expect(compiled).toContain('<rect x="0" y="0" width="40" height="20" fill="#FF0000"/>');
});

test("per-corner radii compile to a path rounding only the corners that ask for it", () => {
  const compiled = compile(
    document([
      rect({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        cornerRadius: { topLeft: 20, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<path d="M 20 0 H 100 V 50 H 0 V 20 A 20 20 0 0 1 20 0 Z" fill="#FF0000"/>',
  );
});

test("per-corner radii round each corner clockwise from the top-left", () => {
  const compiled = compile(
    document([
      rect({
        x: 10,
        y: 5,
        width: 100,
        height: 50,
        cornerRadius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<path d="M 11 5 H 108 A 2 2 0 0 1 110 7 V 52 A 3 3 0 0 1 107 55 H 14 ' +
      'A 4 4 0 0 1 10 51 V 6 A 1 1 0 0 1 11 5 Z"',
  );
});

test("per-corner radii too large for their sides shrink together, keeping their proportions", () => {
  const compiled = compile(
    document([
      rect({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        cornerRadius: { topLeft: 100, topRight: 100, bottomRight: 0, bottomLeft: 0 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    'd="M 50 0 H 50 A 50 50 0 0 1 100 50 V 100 H 0 V 50 A 50 50 0 0 1 50 0 Z"',
  );
});

function ellipse(overrides: Partial<EllipseElement> = {}): EllipseElement {
  return { ...rect(), type: "ellipse", ...overrides };
}

function vector(overrides: Partial<VectorElement> = {}): VectorElement {
  return {
    ...rect(),
    type: "vector",
    path: "M0 0 L24 12 L0 24 Z",
    viewBox: { width: 24, height: 24 },
    ...overrides,
  };
}

test("an ellipse fills its box", () => {
  const compiled = compile(document([ellipse({ x: 10, y: 20, width: 100, height: 50 })]), assets());

  expect(compiled).toContain('<ellipse cx="60" cy="45" rx="50" ry="25" fill="#FF0000"/>');
});

test("a vector scales its path from its own viewBox to the element's width and height", () => {
  const compiled = compile(document([vector({ x: 10, y: 20, width: 120, height: 60 })]), assets());

  expect(compiled).toContain(
    '<path d="M0 0 L24 12 L0 24 Z" transform="translate(10 20) scale(5 2.5)" fill="#FF0000"/>',
  );
});

test("a vector whose viewBox has no extent draws nothing rather than markup full of NaN", () => {
  const compiled = compile(document([vector({ viewBox: { width: 0, height: 0 } })]), assets());

  expect(compiled).toContain('transform="translate(0 0) scale(0 0)"');
});

test("a linear gradient at angle 0 runs left to right across the box", () => {
  const compiled = compile(
    document([], {
      type: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#FFFFFF80" },
      ],
    }),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      "<defs>",
      '<linearGradient id="canvas-background" gradientUnits="userSpaceOnUse" ' +
        'x1="0" y1="50" x2="200" y2="50">' +
        '<stop offset="0" stop-color="#000000"/>' +
        '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0.502"/>' +
        "</linearGradient>",
      "</defs>",
      '<rect width="200" height="100" fill="url(#canvas-background)"/>',
    ),
  );
});

test("a linear gradient at angle 90 runs top to bottom", () => {
  const compiled = compile(
    document([], { type: "linear", angle: 90, stops: [{ offset: 0, color: "#000000" }] }),
    assets(),
  );

  expect(compiled).toContain('x1="100" y1="0" x2="100" y2="100"');
});

test("a linear gradient's angle turns clockwise and its line spans the whole box", () => {
  const compiled = compile(
    document([], { type: "linear", angle: 45, stops: [{ offset: 0, color: "#000000" }] }),
    assets(),
  );

  expect(compiled).toContain('x1="25" y1="-25" x2="175" y2="125"');
});

test("a linear gradient on an element runs across that element's box, not the canvas", () => {
  const compiled = compile(
    document([
      rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }] },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    'id="fill-r" gradientUnits="userSpaceOnUse" x1="10" y1="45" x2="110" y2="45"',
  );
  expect(compiled).toContain('fill="url(#fill-r)"');
});

test("a radial gradient is centered in the element's bounding box", () => {
  const compiled = compile(
    document([
      rect({
        fill: {
          type: "radial",
          stops: [
            { offset: 0, color: "#FF0000" },
            { offset: 1, color: "#0000FF" },
          ],
        },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<radialGradient id="fill-r">' +
      '<stop offset="0" stop-color="#FF0000"/>' +
      '<stop offset="1" stop-color="#0000FF"/>' +
      "</radialGradient>",
  );
});

test("a definition id survives an element id that XML cannot name", () => {
  const compiled = compile(
    document([
      rect({
        id: "hero rect#1",
        fill: { type: "radial", stops: [{ offset: 0, color: "#FF0000" }] },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain('id="fill-hero_20rect_231"');
  expect(compiled).toContain('fill="url(#fill-hero_20rect_231)"');
});

test("the same document compiles to the same string every time", () => {
  const gradient = (): Fill => ({
    type: "linear",
    angle: 33,
    stops: [
      { offset: 0, color: "#123456" },
      { offset: 1, color: "#ABCDEF" },
    ],
  });
  const build = (): DesignDocument =>
    document(
      [
        rect({ id: "a", fill: gradient() }),
        rect({ id: "b", x: 3.3, y: 7.7, fill: { type: "radial", stops: [] } }),
      ],
      gradient(),
    );

  expect(compile(build(), assets())).toBe(compile(build(), assets()));
});

test("a border strokes the edge with its declared color and width", () => {
  const compiled = compile(document([rect({ border: { color: "#0055FF", width: 4 } })]), assets());

  expect(compiled).toContain(
    '<rect x="0" y="0" width="40" height="20" fill="#FF0000" stroke="#0055FF" stroke-width="4"/>',
  );
});

test("a border color carries its own alpha", () => {
  const compiled = compile(
    document([rect({ border: { color: "#0055FF80", width: 1 } })]),
    assets(),
  );

  expect(compiled).toContain('stroke="#0055FF" stroke-width="1" stroke-opacity="0.502"');
});

test("a border on a vector keeps its declared width despite the path's scaling", () => {
  const compiled = compile(
    document([vector({ width: 120, height: 60, border: { color: "#000000", width: 2 } })]),
    assets(),
  );

  expect(compiled).toContain('stroke-width="2" vector-effect="non-scaling-stroke"');
});

test("an unresolved Variable reference is a compile error, never something painted", () => {
  expect(() => compile(document([rect({ fill: { $var: "brand" } })]), assets())).toThrow(
    /Variable "brand"/,
  );
  expect(() =>
    compile(document([rect({ border: { color: { $var: "line" }, width: 1 } })]), assets()),
  ).toThrow(/Variable "line"/);
  expect(() => compile(document([], { $var: "backdrop" }), assets())).toThrow(
    /Variable "backdrop"/,
  );
});

test("a shadow paints behind the element at its own offset, blur, color, and opacity", () => {
  const compiled = compile(
    document([rect({ shadow: { dx: 4, dy: 6, blur: 10, color: "#000000", opacity: 0.5 } })]),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      "<defs>",
      '<filter id="shadow-r" filterUnits="userSpaceOnUse" x="-15" y="-15" width="74" ' +
        'height="56" color-interpolation-filters="sRGB">' +
        '<feDropShadow dx="4" dy="6" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/>' +
        "</filter>",
      "</defs>",
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<g filter="url(#shadow-r)"><rect x="0" y="0" width="40" height="20" fill="#FF0000"/></g>',
    ),
  );
});

test("a shadow color's own alpha multiplies the shadow's opacity", () => {
  const compiled = compile(
    document([rect({ shadow: { dx: 0, dy: 0, blur: 0, color: "#00000080", opacity: 0.5 } })]),
    assets(),
  );

  expect(compiled).toContain('flood-color="#000000" flood-opacity="0.251"');
});

test("a shadow's room in the filter region accounts for the border it draws around", () => {
  const compiled = compile(
    document([
      rect({
        border: { color: "#000000", width: 8 },
        shadow: { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 1 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain('x="-4" y="-4" width="48" height="28"');
});

test("element opacity fades the element as a whole", () => {
  const compiled = compile(document([rect({ opacity: 0.5 })]), assets());

  expect(compiled).toContain(
    '<g opacity="0.5"><rect x="0" y="0" width="40" height="20" fill="#FF0000"/></g>',
  );
});

test("rotation turns the element clockwise about its own center", () => {
  const compiled = compile(
    document([rect({ x: 10, y: 20, width: 100, height: 50, rotation: 30 })]),
    assets(),
  );

  expect(compiled).toContain(
    '<g transform="rotate(30 60 45)"><rect x="10" y="20" width="100" height="50" fill="#FF0000"/></g>',
  );
});

test("a fully painted element wears its transform, opacity, and shadow on one wrapper", () => {
  const compiled = compile(
    document([
      rect({
        rotation: 90,
        opacity: 0.25,
        shadow: { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 1 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<g transform="rotate(90 20 10)" opacity="0.25" filter="url(#shadow-r)">',
  );
});

test("an element at full opacity and no rotation or shadow needs no wrapper", () => {
  const compiled = compile(document([rect()]), assets());

  expect(compiled).not.toContain("<g");
});

test("an invisible element draws nothing and leaves no trace in the markup", () => {
  const compiled = compile(
    document([
      rect({
        id: "hidden",
        visible: false,
        fill: { type: "radial", stops: [{ offset: 0, color: "#FF0000" }] },
        shadow: { dx: 1, dy: 1, blur: 1, color: "#000000", opacity: 1 },
      }),
    ]),
    assets(),
  );

  expect(compiled).toBe(svg('<rect width="200" height="100" fill="#FFFFFF"/>'));
});

test("an authored string cannot break out of the attribute it is written into", () => {
  const compiled = compile(document([vector({ path: 'M0 0 L1 1" onload="alert(1)' })]), assets());

  expect(compiled).toContain('d="M0 0 L1 1&quot; onload=&quot;alert(1)"');
  expect(compiled).not.toContain('onload="alert');
});
