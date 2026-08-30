import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import { expect, test } from "vitest";

import type {
  AssetResolver,
  DesignDocument,
  Element,
  EllipseElement,
  Fill,
  GroupElement,
  ImageElement,
  RectElement,
  TextElement,
  VarRef,
  VectorElement,
} from "./index.ts";
import { compile } from "./index.ts";

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
      '<rect data-element="bottom" x="0" y="0" width="40" height="20" fill="#FF0000"/>',
      '<rect data-element="top" x="10" y="5" width="40" height="20" fill="#0000FF"/>',
    ),
  );
});

test("a uniform corner radius stays a rect", () => {
  const compiled = compile(document([rect({ cornerRadius: 20 })]), assets());

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<rect data-element="r" x="0" y="0" width="40" height="20" rx="20" fill="#FF0000"/>',
    ),
  );
});

test("a corner radius of zero leaves the rect unrounded", () => {
  const compiled = compile(document([rect({ cornerRadius: 0 })]), assets());

  expect(compiled).toContain(
    '<rect data-element="r" x="0" y="0" width="40" height="20" fill="#FF0000"/>',
  );
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
    '<path data-element="r" d="M 20 0 H 100 V 50 H 0 V 20 A 20 20 0 0 1 20 0 Z" fill="#FF0000"/>',
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
    '<path data-element="r" d="M 11 5 H 108 A 2 2 0 0 1 110 7 V 52 A 3 3 0 0 1 107 55 H 14 ' +
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

  expect(compiled).toContain(
    '<ellipse data-element="r" cx="60" cy="45" rx="50" ry="25" fill="#FF0000"/>',
  );
});

test("a vector scales its path from its own viewBox to the element's width and height", () => {
  const compiled = compile(document([vector({ x: 10, y: 20, width: 120, height: 60 })]), assets());

  expect(compiled).toContain(
    '<path data-element="r" d="M0 0 L24 12 L0 24 Z" transform="translate(10 20) scale(5 2.5)" fill="#FF0000"/>',
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
    '<rect data-element="r" x="0" y="0" width="40" height="20" fill="#FF0000" stroke="#0055FF" stroke-width="4"/>',
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
  expect(() => compile(document([image({ src: { $var: "photo" } })]), assets())).toThrow(
    /Variable "photo"/,
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
      '<g data-element="r" filter="url(#shadow-r)"><rect x="0" y="0" width="40" height="20" fill="#FF0000"/></g>',
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
    '<g data-element="r" opacity="0.5"><rect x="0" y="0" width="40" height="20" fill="#FF0000"/></g>',
  );
});

test("rotation turns the element clockwise about its own center", () => {
  const compiled = compile(
    document([rect({ x: 10, y: 20, width: 100, height: 50, rotation: 30 })]),
    assets(),
  );

  expect(compiled).toContain(
    '<g data-element="r" transform="rotate(30 60 45)"><rect x="10" y="20" width="100" height="50" fill="#FF0000"/></g>',
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
    '<g data-element="r" transform="rotate(90 20 10)" opacity="0.25" filter="url(#shadow-r)">',
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

const oswaldBold = bundledFonts.find(
  (font) => font.family === "Oswald" && font.weight === 700 && font.style === "normal",
)!;

function fontAssets(): AssetResolver {
  return {
    ...assets(),
    fontBytes(fontAssetId) {
      const font = bundledFonts.find((candidate) => candidate.id === fontAssetId);
      if (!font) throw new Error(`no bundled font ${fontAssetId}`);
      return bundledFontBytes(font);
    },
  };
}

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "t",
    type: "text",
    x: 0,
    y: 0,
    width: 290,
    rotation: 0,
    opacity: 1,
    visible: true,
    content: "LIMITED OFFER",
    fontAssetId: oswaldBold.id,
    fontSize: 30,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#000000",
    ...overrides,
  };
}

function lines(compiled: string): { x: string; y: string; text: string }[] {
  return [...compiled.matchAll(/<tspan x="([^"]*)" y="([^"]*)">([^<]*)<\/tspan>/g)].map(
    ([, x, y, content]) => ({ x: x!, y: y!, text: content! }),
  );
}

test("the wrap width alone decides where a line breaks", () => {
  const wide = compile(document([text({ width: 290 })]), fontAssets());
  const narrow = compile(document([text({ width: 120 })]), fontAssets());

  expect(lines(wide).map((line) => line.text)).toEqual(["LIMITED OFFER"]);
  expect(lines(narrow).map((line) => line.text)).toEqual(["LIMITED", "OFFER"]);
});

test("a word too wide for a line of its own breaks between characters", () => {
  const compiled = compile(document([text({ content: "LIMITED", width: 60 })]), fontAssets());

  expect(lines(compiled).map((line) => line.text)).toEqual(["LIMI", "TED"]);
});

test("a line is measured with the font's kerning applied", () => {
  const kerned = compile(document([text({ content: "AV", align: "right" })]), fontAssets());
  const apart = compile(document([text({ content: "A V", align: "right" })]), fontAssets());

  expect(lines(kerned)[0]?.x).toBe("258.71");
  expect(lines(apart)[0]?.x).toBe("250.01");
});

test("letter spacing lands in the gaps between glyphs, not after the last one", () => {
  const compiled = compile(
    document([text({ content: "OFFER", letterSpacing: 2, align: "right" })]),
    fontAssets(),
  );

  expect(lines(compiled)[0]?.x).toBe("206.97");
});

test("align places each line within the wrap width", () => {
  const placed = (align: TextElement["align"]): string | undefined =>
    lines(compile(document([text({ content: "OFFER", align })]), fontAssets()))[0]?.x;

  expect(placed("left")).toBe("0");
  expect(placed("center")).toBe("107.485");
  expect(placed("right")).toBe("214.97");
});

test("the line advance is the font size times the line height", () => {
  const compiled = compile(
    document([text({ content: "LIMITED OFFER", width: 120, lineHeight: 2 })]),
    fontAssets(),
  );

  expect(lines(compiled).map((line) => line.y)).toEqual(["50.79", "110.79"]);
});

test("a baseline sits half the leading plus the font's own ascent below its line box", () => {
  const half = compile(document([text({ content: "OFFER", lineHeight: 1.2 })]), fontAssets());
  const flush = compile(document([text({ content: "OFFER", lineHeight: 1 })]), fontAssets());

  expect(lines(half)[0]?.y).toBe("38.79");
  expect(lines(flush)[0]?.y).toBe("35.79");
});

test("anchor moves the whole block of line boxes, and nothing within it", () => {
  const block = (anchor: TextElement["anchor"], y: number): string =>
    compile(
      document([text({ content: "LIMITED OFFER LIMITED", width: 120, y, anchor })]),
      fontAssets(),
    );

  expect(block("middle", 400)).toBe(block("top", 346));
  expect(block("bottom", 454)).toBe(block("top", 346));
});

test("a middle-anchored block is centered on the element's y, first baseline above it", () => {
  const compiled = compile(
    document([text({ content: "LIMITED OFFER LIMITED", width: 120, y: 400, anchor: "middle" })]),
    fontAssets(),
  );

  const baselines = lines(compiled).map((line) => Number(line.y));
  expect(baselines).toEqual([384.79, 420.79, 456.79]);
  expect(baselines[0]! - 3 - 35.79 + 108 / 2).toBe(400);
});

test("the compiled markup carries the Font Asset's own bytes and asks no host for a font", () => {
  const compiled = compile(document([text()]), fontAssets());

  expect(compiled).toContain(
    `<style>@font-face{font-family:"font-${oswaldBold.id}";src:url(data:font/ttf;base64,`,
  );
  const encoded = /base64,([^)]*)\)/.exec(compiled)?.[1] ?? "";
  expect(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))).toEqual(
    new Uint8Array(bundledFontBytes(oswaldBold)),
  );
  expect(compiled).toContain('format("truetype")}</style>');
  expect(compiled).toContain(`<text font-family="font-${oswaldBold.id}"`);
  expect(compiled).not.toMatch(/url\((?!data:)/);
});

test("one Font Asset is carried once, however many elements draw with it", () => {
  const compiled = compile(
    document([text({ id: "a" }), text({ id: "b", y: 50, content: "OFFER" })]),
    fontAssets(),
  );

  expect(compiled.match(/@font-face/g)).toHaveLength(1);
});

test("a Font Asset nothing draws with is not carried into the markup", () => {
  const compiled = compile(
    document([text({ visible: false }), text({ id: "empty", content: "" })]),
    fontAssets(),
  );

  expect(compiled).toBe(svg('<rect width="200" height="100" fill="#FFFFFF"/>'));
});

test("a character the Font Asset has no glyph for is drawn as that font's .notdef", () => {
  const compiled = compile(document([text({ content: "A☃" })]), fontAssets());

  expect(lines(compiled).map((line) => line.text)).toEqual(["A"]);
  expect(compiled).not.toContain("☃");
  expect(compiled).toContain(
    '<path d="M34.0500 38.7900L18.9900 38.7900L18.9900 14.4900L34.0500 14.4900L34.0500 38.7900Z' +
      'M22.0800 17.1900L22.0800 36.0900L30.9600 36.0900L30.9600 17.1900L22.0800 17.1900Z" ' +
      'fill="#000000"/>',
  );
});

test("a Font Asset the resolver cannot supply fails the compilation, naming it and its elements", () => {
  const document_ = document([
    text({ id: "headline", fontAssetId: "missing-font" }),
    text({ id: "price", fontAssetId: "missing-font", y: 50 }),
  ]);

  expect(() => compile(document_, fontAssets())).toThrow(
    /"missing-font", referenced by "headline", "price"/,
  );
});

test("a text element paints in its own color and casts its own shadow", () => {
  const compiled = compile(
    document([
      text({
        content: "Price: 4.99",
        color: "#FF008080",
        shadow: { dx: 2, dy: 3, blur: 4, color: "#000000", opacity: 0.5 },
      }),
    ]),
    fontAssets(),
  );

  expect(compiled).toContain('fill="#FF0080" fill-opacity="0.502" xml:space="preserve"');
  expect(compiled).toContain('<tspan x="0" y="38.79">Price: 4.99</tspan>');
  expect(compiled).toContain('<g data-element="t" filter="url(#shadow-t)">');
  expect(compiled).toContain(
    '<feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.5"/>',
  );
});

test("a text shadow's filter region covers the glyphs, not just the line boxes", () => {
  const compiled = compile(
    document([
      text({
        content: "OFFER",
        shadow: { dx: 0, dy: 0, blur: 0, color: "#000000", opacity: 1 },
      }),
    ]),
    fontAssets(),
  );

  expect(compiled).toContain('x="0" y="3" width="75.03" height="44.46"');
});

test("text growing past the canvas edge is cut by the canvas, not by the compiler", () => {
  const compiled = compile(
    document([text({ content: "LIMITED OFFER LIMITED", width: 120, y: 60 })]),
    fontAssets(),
  );

  expect(compiled).toContain(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">',
  );
  expect(compiled).not.toContain("overflow");
  expect(lines(compiled).map((line) => line.y)).toEqual(["98.79", "134.79", "170.79"]);
});

test("a document with text compiles to the same string every time", () => {
  const build = (): DesignDocument =>
    document([text({ content: "LIMITED OFFER ☃", width: 120, align: "center" })]);

  expect(compile(build(), fontAssets())).toBe(compile(build(), fontAssets()));
});

test("a newline in the content is a break the author wrote, kept as one", () => {
  const compiled = compile(document([text({ content: "OFFER\r\nNOW\n\nENDS" })]), fontAssets());

  expect(lines(compiled).map((line) => line.text)).toEqual(["OFFER", "NOW", "ENDS"]);
  expect(lines(compiled).map((line) => line.y)).toEqual(["38.79", "74.79", "146.79"]);
});

test("the spaces inside a line are the ones the compiler measured", () => {
  const compiled = compile(document([text({ content: "A  B\tC" })]), fontAssets());

  expect(lines(compiled).map((line) => line.text)).toEqual(["A  B C"]);
  expect(compiled).toContain('xml:space="preserve"');
  expect(compiled).not.toContain("<path");
});

test("an unresolved text color is a compile error, never something painted", () => {
  expect(() => compile(document([text({ color: { $var: "ink" } })]), fontAssets())).toThrow(
    /Variable "ink"/,
  );
});

function imageAssets(
  sizes: Record<string, { width: number; height: number }> = { photo: { width: 800, height: 600 } },
): AssetResolver {
  const size = (src: string): { width: number; height: number } => {
    const known = sizes[src];
    if (!known) throw new Error(`no image asset ${src}`);
    return known;
  };
  return {
    ...assets(),
    imageUrl(src) {
      size(src);
      return `https://assets.test/${src}`;
    },
    imageSize: size,
  };
}

function image(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: "i",
    type: "image",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    visible: true,
    src: "photo",
    naturalWidth: 800,
    naturalHeight: 600,
    fitMode: "cover",
    clip: "none",
    ...overrides,
  };
}

test("an image draws the asset the resolver names, inside its frame and clipped to it", () => {
  const compiled = compile(document([image({ x: 10, y: 20, fitMode: "stretch" })]), imageAssets());

  expect(compiled).toBe(
    svg(
      "<defs>",
      '<clipPath id="clip-i"><rect x="10" y="20" width="400" height="400"/></clipPath>',
      "</defs>",
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<image data-element="i" href="https://assets.test/photo" x="10" y="20" width="400" height="400" ' +
        'preserveAspectRatio="none" clip-path="url(#clip-i)"/>',
    ),
  );
});

test("an authored image draws at the offset and scale its crop was authored with", () => {
  const compiled = compile(
    document([image({ x: 10, y: 20, content: { offsetX: -50, offsetY: -20, scale: 0.75 } })]),
    imageAssets(),
  );

  expect(compiled).toContain(
    '<image data-element="i" href="https://assets.test/photo" x="-40" y="0" width="600" height="450"',
  );
});

test("an image supplied by a Variable is placed by its Fit Mode, against the size the resolver reports", () => {
  const placed = (fitMode: ImageElement["fitMode"]): string | undefined =>
    /<image [^>]*x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/
      .exec(
        compile(
          document([image({ naturalWidth: 100, naturalHeight: 100, fitMode })]),
          imageAssets(),
        ),
      )
      ?.slice(1)
      .join(" ");

  expect(placed("cover")).toBe("-66.6667 0 533.3333 400");
  expect(placed("contain")).toBe("0 50 400 300");
  expect(placed("stretch")).toBe("0 0 400 400");
});

test("an ellipse clip cuts the image to the ellipse inscribed in its frame, corner radius or not", () => {
  const compiled = compile(
    document([image({ x: 10, y: 20, clip: "ellipse", cornerRadius: 30 })]),
    imageAssets(),
  );

  expect(compiled).toContain(
    '<clipPath id="clip-i"><ellipse cx="210" cy="220" rx="200" ry="200"/></clipPath>',
  );
});

test("a path clip cuts the image to that path, drawn from the frame's own corner", () => {
  const compiled = compile(
    document([image({ x: 10, y: 20, clip: { path: "M0 0 L400 0 L0 400 Z" }, cornerRadius: 30 })]),
    imageAssets(),
  );

  expect(compiled).toContain(
    '<clipPath id="clip-i"><path d="M0 0 L400 0 L0 400 Z" transform="translate(10 20)"/></clipPath>',
  );
});

test("a border on a path-clipped image traces that same path", () => {
  const compiled = compile(
    document([
      image({
        clip: { path: "M0 0 L400 0 L0 400 Z" },
        border: { color: "#0055FF", width: 4 },
      }),
    ]),
    imageAssets(),
  );

  expect(compiled).toContain(
    '<path d="M0 0 L400 0 L0 400 Z" transform="translate(0 0)" fill="none" ' +
      'stroke="#0055FF" stroke-width="4"/>',
  );
});

test("an image with no clip of its own is cut by its frame, rounded by its corner radius", () => {
  const uniform = compile(document([image({ cornerRadius: 20 })]), imageAssets());
  const perCorner = compile(
    document([
      image({ cornerRadius: { topLeft: 20, topRight: 0, bottomRight: 0, bottomLeft: 0 } }),
    ]),
    imageAssets(),
  );

  expect(uniform).toContain(
    '<clipPath id="clip-i"><rect x="0" y="0" width="400" height="400" rx="20"/></clipPath>',
  );
  expect(perCorner).toContain(
    '<clipPath id="clip-i"><path d="M 20 0 H 400 V 400 H 0 V 20 A 20 20 0 0 1 20 0 Z"/></clipPath>',
  );
});

test("a border traces the same shape the clip cuts, and is not cut by it", () => {
  const compiled = compile(
    document([image({ clip: "ellipse", border: { color: "#0055FF", width: 4 } })]),
    imageAssets(),
  );

  expect(compiled).toContain(
    '<image href="https://assets.test/photo" x="-66.6667" y="0" width="533.3333" height="400" ' +
      'preserveAspectRatio="none" clip-path="url(#clip-i)"/>' +
      '<ellipse cx="200" cy="200" rx="200" ry="200" fill="none" ' +
      'stroke="#0055FF" stroke-width="4"/>',
  );
});

test("corner radius, border, shadow, opacity, and rotation behave on an image as on a rect", () => {
  const shared = {
    id: "e",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    rotation: 30,
    opacity: 0.5,
    cornerRadius: { topLeft: 20, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    border: { color: "#0055FF", width: 8 },
    shadow: { dx: 4, dy: 6, blur: 10, color: "#000000", opacity: 0.5 },
  };
  const asImage = compile(document([image({ ...shared, fitMode: "stretch" })]), imageAssets());
  const asRect = compile(document([rect(shared)]), assets());
  const shape = (compiled: string): (string | undefined)[] => [
    /<filter[^>]*>.*?<\/filter>/.exec(compiled)?.[0],
    /<g [^>]*>/.exec(compiled)?.[0],
    /<path d="[^"]*"/.exec(compiled)?.[0],
  ];

  expect(shape(asImage)).toEqual(shape(asRect));
  expect(asImage).toContain('stroke-width="8"/></g>');
});

test("an Image Asset the resolver cannot supply fails the compilation, naming it and its elements", () => {
  const document_ = document([
    image({ id: "hero", src: "missing-image" }),
    image({ id: "thumb", src: "missing-image", y: 50 }),
    image({ id: "logo" }),
  ]);

  expect(() => compile(document_, imageAssets())).toThrow(
    /"missing-image", referenced by "hero", "thumb"/,
  );
});

test("an image the resolver reports no extent for draws nothing rather than markup full of NaN", () => {
  const compiled = compile(
    document([image({ src: "empty" })]),
    imageAssets({ empty: { width: 0, height: 0 } }),
  );

  expect(compiled).toContain('x="0" y="0" width="0" height="0"');
});

function group(children: Element[], overrides: Partial<GroupElement> = {}): GroupElement {
  return {
    id: "g",
    type: "group",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    children,
    ...overrides,
  };
}

test("a group draws its children in order, at the coordinates its own origin gives them", () => {
  const compiled = compile(
    document([
      group([rect({ id: "under", x: 10, y: 10 }), rect({ id: "over", x: 30, y: 10 })], {
        x: 100,
        y: 50,
      }),
    ]),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<g data-element="g" transform="translate(100 50)">' +
        '<rect data-element="under" x="10" y="10" width="40" height="20" fill="#FF0000"/>' +
        '<rect data-element="over" x="30" y="10" width="40" height="20" fill="#FF0000"/>' +
        "</g>",
    ),
  );
});

test("groups nest to any depth, each origin counted from the one above it", () => {
  const compiled = compile(
    document([
      group([group([rect({ x: 1, y: 1 })], { id: "inner", x: 10, y: 5 })], {
        id: "outer",
        x: 100,
        y: 50,
      }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<g data-element="outer" transform="translate(100 50)">' +
      '<g data-element="inner" transform="translate(10 5)">' +
      '<rect data-element="r" x="1" y="1" width="40" height="20" fill="#FF0000"/>' +
      "</g></g>",
  );
});

test("group opacity fades the group as one unit, not each child on its own", () => {
  const compiled = compile(
    document([group([rect({ id: "under" }), rect({ id: "over", x: 20 })], { opacity: 0.5 })]),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<g data-element="g" opacity="0.5">' +
        '<rect data-element="under" x="0" y="0" width="40" height="20" fill="#FF0000"/>' +
        '<rect data-element="over" x="20" y="0" width="40" height="20" fill="#FF0000"/>' +
        "</g>",
    ),
  );
});

test("group rotation turns the whole arrangement about the middle of its children", () => {
  const compiled = compile(
    document([
      group(
        [
          rect({ id: "a", x: 0, y: 0, width: 100, height: 50 }),
          rect({ id: "b", x: 100, y: 50, width: 100, height: 50 }),
        ],
        { rotation: 30 },
      ),
    ]),
    assets(),
  );

  expect(compiled).toContain('<g data-element="g" transform="rotate(30 100 50)">');
});

test("a rotated group turns about a center in its own coordinates, wherever it sits", () => {
  const compiled = compile(
    document([
      group(
        [
          rect({ id: "a", x: 0, y: 0, width: 100, height: 50 }),
          rect({ id: "b", x: 100, y: 50, width: 100, height: 50 }),
        ],
        { x: 30, y: 20, rotation: 30 },
      ),
    ]),
    assets(),
  );

  expect(compiled).toContain('<g data-element="g" transform="translate(30 20) rotate(30 100 50)">');
});

test("a hidden group draws nothing, and neither does anything under it", () => {
  const compiled = compile(
    document([
      group([rect({ fill: { type: "radial", stops: [{ offset: 0, color: "#FF0000" }] } })], {
        visible: false,
      }),
      rect({ id: "sibling" }),
    ]),
    assets(),
  );

  expect(compiled).toBe(
    svg(
      '<rect width="200" height="100" fill="#FFFFFF"/>',
      '<rect data-element="sibling" x="0" y="0" width="40" height="20" fill="#FF0000"/>',
    ),
  );
});

test("a hidden child inside a visible group hides only itself", () => {
  const compiled = compile(
    document([
      group([rect({ id: "gone", visible: false }), rect({ id: "kept", x: 20 })], { x: 100 }),
    ]),
    assets(),
  );

  expect(compiled).toContain(
    '<g data-element="g" transform="translate(100 0)">' +
      '<rect data-element="kept" x="20" y="0" width="40" height="20" fill="#FF0000"/>' +
      "</g>",
  );
});

test("a group's extent is its children's: adding, moving, or hiding one moves the middle it turns about", () => {
  const left = rect({ id: "left", x: 0, y: 0, width: 100, height: 100 });
  const right = rect({ id: "right", x: 100, y: 0, width: 100, height: 100 });
  const turn = (children: Element[]): string =>
    compile(document([group(children, { rotation: 45 })]), assets());

  expect(turn([left])).toContain("rotate(45 50 50)");
  expect(turn([left, right])).toContain("rotate(45 100 50)");
  expect(turn([left, { ...right, x: 300 }])).toContain("rotate(45 200 50)");
  expect(turn([left, { ...right, visible: false }])).toContain("rotate(45 50 50)");
});

test("a child's own rotation counts towards the extent, so the group turns about what it reaches", () => {
  const upright = rect({ id: "square", x: 0, y: 0, width: 100, height: 100 });
  const turned = rect({ id: "tall", x: 100, y: 0, width: 20, height: 100, rotation: 90 });

  const compiled = compile(document([group([upright, turned], { rotation: 45 })]), assets());

  expect(compiled).toContain("rotate(45 80 50)");
});

test("a text child brings the block of line boxes it laid out to its group's extent", () => {
  const compiled = compile(
    document([
      group([text({ content: "ONE TWO", width: 100, fontSize: 20, lineHeight: 1 })], {
        rotation: 90,
      }),
    ]),
    fontAssets(),
  );

  expect(compiled).toContain("rotate(90 50 10)");
});

test("what a child paints with is measured in the coordinates its group gives it", () => {
  const compiled = compile(
    document([
      group(
        [
          rect({
            id: "shaded",
            fill: { type: "linear", angle: 0, stops: [{ offset: 0, color: "#FF0000" }] },
            shadow: { dx: 0, dy: 0, blur: 4, color: "#000000", opacity: 1 },
          }),
        ],
        { x: 100, y: 50 },
      ),
    ]),
    assets(),
  );

  expect(compiled).toContain('x1="0" y1="10" x2="40" y2="10"');
  expect(compiled).toContain('filterUnits="userSpaceOnUse" x="-6" y="-6" width="52" height="32"');
});

test("a group's text and image children are drawn from the assets they name, as any other child is", () => {
  const compiled = compile(
    document([
      group([image({ fitMode: "stretch", width: 40, height: 30 }), text({ content: "HI" })], {
        x: 100,
        y: 50,
      }),
    ]),
    { ...imageAssets(), fontBytes: (fontAssetId) => fontAssets().fontBytes(fontAssetId) },
  );

  expect(compiled).toContain(
    '<image data-element="i" href="https://assets.test/photo" x="0" y="0"',
  );
  expect(compiled).toContain('<text font-family="font-' + oswaldBold.id + '"');
  expect(compiled).toContain(`@font-face{font-family:"font-${oswaldBold.id}"`);
});

test("an element names itself on the node it is drawn as", () => {
  const compiled = compile(document([rect({ id: "hero" })]), assets());

  expect(compiled).toContain('<rect data-element="hero" x="0" y="0"');
});

test("an element that already needs a group of its own is named there, and only there", () => {
  const compiled = compile(document([rect({ id: "turned", rotation: 45 })]), assets());

  expect(compiled).toContain('<g data-element="turned" transform="rotate(45 20 10)">');
  expect(compiled).not.toContain("<rect data-element");
});

test("an element drawn as several nodes is gathered into one that carries its name", () => {
  const compiled = compile(document([text({ id: "headline" })]), fontAssets());

  expect(compiled).toContain('<g data-element="headline"><text');
});

test("a group names itself, and so does every child inside it", () => {
  const compiled = compile(
    document([group([rect({ id: "inside" })], { id: "outer", x: 10 })]),
    assets(),
  );

  expect(compiled).toContain('<g data-element="outer" transform="translate(10 0)">');
  expect(compiled).toContain('<rect data-element="inside"');
});
