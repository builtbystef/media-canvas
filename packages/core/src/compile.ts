// The JSON→SVG compiler (ADR-0001, ADR-0003): the single place render fidelity
// is defined. The editor mounts the string it returns and the render worker
// screenshots that same string, so neither side has room to disagree with the
// other about what a document looks like.

import type { Font } from "opentype.js";
import { parse as parseFont } from "opentype.js";

import type { AssetResolver } from "./assets.ts";
import type {
  Border,
  CornerRadius,
  DesignDocument,
  Element,
  Fill,
  GradientStop,
  Shadow,
  TextElement,
  VarRef,
} from "./document.ts";
import type { TextLayout, TextPiece } from "./text.ts";
import { layoutText } from "./text.ts";

/** What one element is painted into: its geometry in canvas coordinates. */
type Box = { x: number; y: number; width: number; height: number };

/** One Font Asset, held once per compilation: its bytes go into the markup as
 *  an `@font-face` source, and the parsed font answers every text metric. */
type LoadedFont = { bytes: ArrayBuffer; font: Font };

/** The state one compilation threads through the element tree. `defs` collects
 *  gradients and filters in the order elements ask for them, so that the same
 *  document always yields the same `<defs>` block; `usedFonts` collects, in the
 *  same way, the Font Assets that something drawn actually asks for. */
type Context = {
  assets: AssetResolver;
  defs: string[];
  fonts: Map<string, LoadedFont>;
  usedFonts: Set<string>;
};

/** ` name="value"`, skipping every attribute whose value is absent. */
type Attribute = [name: string, value: string | undefined];

function attributes(pairs: Attribute[]): string {
  return pairs
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Character data, which needs less escaping than an attribute value does. */
function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Numbers reach the markup through here alone: rounded to a fixed precision so
 *  that arithmetic on floats cannot make two runs disagree over a digit. */
function num(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function isVarRef(value: unknown): value is VarRef {
  return typeof value === "object" && value !== null && "$var" in value;
}

/** `compile` renders a document that `resolve` has already emptied of Variables.
 *  A reference that reaches it is a pipeline mistake, not something to paint. */
function unresolved(reference: VarRef): never {
  throw new Error(
    `compile received an unresolved reference to the Variable "${reference.$var}" — ` +
      "resolve the document before compiling it",
  );
}

/** A `#RRGGBB` or `#RRGGBBAA` color split into the two attributes SVG paints it
 *  with. Alpha travels separately because `stop-color` and `flood-color` take
 *  their opacity as their own property anyway. */
function paint(color: string): { color: string; opacity: string | undefined } {
  if (color.length !== 9) return { color, opacity: undefined };
  return { color: color.slice(0, 7), opacity: num(alphaOf(color)) };
}

/** The alpha a color carries, 0..1; an `#RRGGBB` color carries none, so 1. */
function alphaOf(color: string): number {
  return color.length === 9 ? Number.parseInt(color.slice(7), 16) / 255 : 1;
}

/** An element id is authored freely, so it is escaped — injectively, so that two
 *  ids can never name one definition — before it names anything in the markup. */
function xmlId(elementId: string): string {
  return elementId.replaceAll(
    /[^A-Za-z0-9]/g,
    (character) => `_${character.charCodeAt(0).toString(16)}`,
  );
}

function compileStops(stops: GradientStop[]): string {
  return stops
    .map((stop) => {
      const { color, opacity } = paint(stop.color);
      return `<stop${attributes([
        ["offset", num(stop.offset)],
        ["stop-color", color],
        ["stop-opacity", opacity],
      ])}/>`;
    })
    .join("");
}

/** The gradient line for `angle`: 0 points right and the angle turns clockwise,
 *  y running down the canvas. The line is centered on the box and long enough
 *  that its ends sit on the box's outermost corners along that direction, so the
 *  whole box is painted whatever the angle is. */
function gradientLine(angle: number, box: Box): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const half = (Math.abs(box.width * dx) + Math.abs(box.height * dy)) / 2;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return {
    x1: centerX - dx * half,
    y1: centerY - dy * half,
    x2: centerX + dx * half,
    y2: centerY + dy * half,
  };
}

function solidFillAttributes(color: string): Attribute[] {
  const { color: value, opacity } = paint(color);
  return [
    ["fill", value],
    ["fill-opacity", opacity],
  ];
}

/** A fill either paints straight into the shape's attributes, or leaves a
 *  gradient definition behind and points the shape at it by id. */
function fillAttributes(fill: Fill | VarRef, box: Box, id: string, context: Context): Attribute[] {
  if (isVarRef(fill)) unresolved(fill);
  if (typeof fill === "string") return solidFillAttributes(fill);
  if (fill.type === "linear") {
    const line = gradientLine(fill.angle, box);
    context.defs.push(
      `<linearGradient${attributes([
        ["id", id],
        ["gradientUnits", "userSpaceOnUse"],
        ["x1", num(line.x1)],
        ["y1", num(line.y1)],
        ["x2", num(line.x2)],
        ["y2", num(line.y2)],
      ])}>${compileStops(fill.stops)}</linearGradient>`,
    );
  } else {
    // The SVG default — a bounding-box unit circle — is already the element's
    // box, centered, so a radial gradient needs no geometry of its own.
    context.defs.push(
      `<radialGradient${attributes([["id", id]])}>${compileStops(fill.stops)}</radialGradient>`,
    );
  }
  return [["fill", `url(#${id})`]];
}

/** SVG centers a stroke on the edge it traces — half inside, half outside —
 *  which is the one alignment v1 offers. */
function borderAttributes(border: Border | undefined): Attribute[] {
  if (!border) return [];
  if (isVarRef(border.color)) unresolved(border.color);
  const { color, opacity } = paint(border.color);
  return [
    ["stroke", color],
    ["stroke-width", num(border.width)],
    ["stroke-opacity", opacity],
  ];
}

type Corners = { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };

/** Radii that overrun their sides shrink by one factor, so that a corner keeps
 *  its share of the side it competes for (the rule CSS border-radius uses). */
function fitCorners(corners: Corners, box: Box): Corners {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  const ratio = (side: number, first: number, second: number): number =>
    first + second === 0 ? 1 : side / (first + second);
  const scale = Math.min(
    1,
    ratio(box.width, topLeft, topRight),
    ratio(box.width, bottomLeft, bottomRight),
    ratio(box.height, topLeft, bottomLeft),
    ratio(box.height, topRight, bottomRight),
  );
  return {
    topLeft: topLeft * scale,
    topRight: topRight * scale,
    bottomRight: bottomRight * scale,
    bottomLeft: bottomLeft * scale,
  };
}

/** The rect outline, drawn clockwise from the top-left corner. A corner with no
 *  radius contributes no arc, so a path with one rounded corner shows one. */
function roundedRectPath(corners: Corners, box: Box): string {
  const { topLeft, topRight, bottomRight, bottomLeft } = fitCorners(corners, box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  const arc = (radius: number, x: number, y: number): string[] =>
    radius === 0 ? [] : [`A ${num(radius)} ${num(radius)} 0 0 1 ${num(x)} ${num(y)}`];
  return [
    `M ${num(left + topLeft)} ${num(top)}`,
    `H ${num(right - topRight)}`,
    ...arc(topRight, right, top + topRight),
    `V ${num(bottom - bottomRight)}`,
    ...arc(bottomRight, right - bottomRight, bottom),
    `H ${num(left + bottomLeft)}`,
    ...arc(bottomLeft, left, bottom - bottomLeft),
    `V ${num(top + topLeft)}`,
    ...arc(topLeft, left + topLeft, top),
    "Z",
  ].join(" ");
}

/** A uniform radius is what `<rect rx>` expresses; per-corner radii are not, so
 *  they compile to a path instead. */
function compileRectShape(
  cornerRadius: CornerRadius | undefined,
  box: Box,
  painting: Attribute[],
): string {
  if (typeof cornerRadius === "object") {
    return `<path${attributes([["d", roundedRectPath(cornerRadius, box)], ...painting])}/>`;
  }
  return `<rect${attributes([
    ["x", num(box.x)],
    ["y", num(box.y)],
    ["width", num(box.width)],
    ["height", num(box.height)],
    ["rx", cornerRadius ? num(cornerRadius) : undefined],
    ...painting,
  ])}/>`;
}

/** A drop shadow, as a filter the element points at. `blur` is the CSS and
 *  Figma sense of the word — the width of the blurred band — which is twice the
 *  Gaussian deviation SVG filters take. The region is stated outright because
 *  the default one crops at 10% of the box, cutting off any shadow worth having,
 *  and it is measured in the element's own space so that a scaled path (a
 *  vector) cannot scale the shadow with it. */
function shadowFilter(shadow: Shadow, id: string, box: Box, border: Border | undefined): string {
  const deviation = shadow.blur / 2;
  const reach = deviation * 3;
  const outset = (border?.width ?? 0) / 2;
  const left = box.x - outset + Math.min(0, shadow.dx) - reach;
  const top = box.y - outset + Math.min(0, shadow.dy) - reach;
  return `<filter${attributes([
    ["id", id],
    ["filterUnits", "userSpaceOnUse"],
    ["x", num(left)],
    ["y", num(top)],
    ["width", num(box.width + outset * 2 + Math.abs(shadow.dx) + reach * 2)],
    ["height", num(box.height + outset * 2 + Math.abs(shadow.dy) + reach * 2)],
    // Filters interpolate in linearRGB by default, which would paint a shadow
    // in a color other than the one the document declares.
    ["color-interpolation-filters", "sRGB"],
  ])}><feDropShadow${attributes([
    ["dx", num(shadow.dx)],
    ["dy", num(shadow.dy)],
    ["stdDeviation", num(deviation)],
    ["flood-color", paint(shadow.color).color],
    ["flood-opacity", num(alphaOf(shadow.color) * shadow.opacity)],
  ])}/></filter>`;
}

/** The CSS family name one Font Asset is drawn under. It comes from the asset
 *  id, so two assets can never collide on one name and no family name a font
 *  file happens to carry can be picked up by accident. */
function fontFamily(fontAssetId: string): string {
  return `font-${xmlId(fontAssetId)}`;
}

/** The sfnt version tag the file opens with says which of the two formats the
 *  bytes are — `OTTO` is CFF outlines, anything else the compiler accepts is
 *  TrueType — which is what the `src` has to declare. */
function fontFormat(bytes: ArrayBuffer): { mime: string; format: string } {
  const otto = 0x4f_54_54_4f;
  return new DataView(bytes).getUint32(0) === otto
    ? { mime: "font/otf", format: "opentype" }
    : { mime: "font/ttf", format: "truetype" };
}

/** The bytes as base64, in chunks small enough that the argument list stays
 *  inside what `String.fromCharCode` takes. `btoa` is the encoder the browser
 *  and Node both have, so the core needs no encoder of its own. */
function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let index = 0; index < view.length; index += 0x80_00) {
    chunks.push(String.fromCharCode(...view.subarray(index, index + 0x80_00)));
  }
  return btoa(chunks.join(""));
}

/** The rule that carries a Font Asset's own bytes into the markup. It is what
 *  makes the compiled string self-contained: whatever draws it — the editor's
 *  inline `<svg>` or the worker's page — needs no font wiring of its own, and
 *  asks no font host for anything. */
function fontFace(fontAssetId: string, context: Context): string {
  const { bytes } = loadedFont(fontAssetId, context);
  const { mime, format } = fontFormat(bytes);
  return (
    `@font-face{font-family:"${fontFamily(fontAssetId)}";` +
    `src:url(data:${mime};base64,${base64(bytes)}) format("${format}")}`
  );
}

function loadedFont(fontAssetId: string, context: Context): LoadedFont {
  const loaded = context.fonts.get(fontAssetId);
  if (!loaded) throw new Error(`compile holds no bytes for the Font Asset "${fontAssetId}"`);
  return loaded;
}

/** Every text element in the document, grouped by the Font Asset it names, so
 *  that a font the resolver cannot supply is reported once, against all of the
 *  elements that wanted it. */
function textElementsByFont(elements: Element[], into: Map<string, string[]>): void {
  for (const element of elements) {
    if (element.type === "text")
      into.set(element.fontAssetId, [...(into.get(element.fontAssetId) ?? []), element.id]);
    else if (element.type === "group") textElementsByFont(element.children, into);
  }
}

/** Load and parse every Font Asset the document names, before anything is
 *  drawn. A font the resolver cannot supply fails the whole compilation: there
 *  is no fallback face to fall back to, and skipping the text would ship an
 *  asset missing its words. */
function loadFonts(doc: DesignDocument, assets: AssetResolver): Map<string, LoadedFont> {
  const referenced = new Map<string, string[]>();
  textElementsByFont(doc.elements, referenced);
  const loaded = new Map<string, LoadedFont>();
  const failures: string[] = [];
  for (const [fontAssetId, elementIds] of referenced) {
    try {
      const bytes = assets.fontBytes(fontAssetId);
      loaded.set(fontAssetId, { bytes, font: parseFont(bytes) });
    } catch (cause) {
      const elements = elementIds.map((id) => `"${id}"`).join(", ");
      const reason = cause instanceof Error ? cause.message : String(cause);
      failures.push(`"${fontAssetId}", referenced by ${elements}: ${reason}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `compile could not load every Font Asset the document references — ${failures.join("; ")}`,
    );
  }
  return loaded;
}

/** Rotation, opacity, and shadow belong to the element rather than to its
 *  geometry, so they ride on a wrapper — which also keeps the shadow's filter
 *  outside any transform the shape itself needs. An element that asks for none
 *  of the three is emitted bare. */
function wrap(
  element: Element,
  shape: string,
  box: Box,
  context: Context,
  /** What the shadow's filter region has to cover, when the element's own box
   *  is not it — a text block's glyphs reach past their line boxes. */
  inkBox: Box = box,
): string {
  const shadow = "shadow" in element ? element.shadow : undefined;
  const border = "border" in element ? element.border : undefined;
  if (element.rotation === 0 && element.opacity === 1 && !shadow) return shape;
  const filterId = `shadow-${xmlId(element.id)}`;
  if (shadow) context.defs.push(shadowFilter(shadow, filterId, inkBox, border));
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return `<g${attributes([
    [
      "transform",
      element.rotation === 0
        ? undefined
        : `rotate(${num(element.rotation)} ${num(center.x)} ${num(center.y)})`,
    ],
    ["opacity", element.opacity === 1 ? undefined : num(element.opacity)],
    ["filter", shadow ? `url(#${filterId})` : undefined],
  ])}>${shape}</g>`;
}

/** A character the Font Asset has no glyph for is drawn as that font's own
 *  `.notdef` outline. Left in the text, the browser would answer it with some
 *  other face — a different one in the editor than in the worker's image — and
 *  a font whose `.notdef` is blank draws nothing, which is its own answer. */
function notdefPath(
  piece: TextPiece,
  baseline: number,
  element: TextElement,
  font: Font,
  painting: Attribute[],
): string {
  const outline = font.glyphs.get(0).getPath(piece.x, baseline, element.fontSize).toPathData(4);
  return outline === "" ? "" : `<path${attributes([["d", outline], ...painting])}/>`;
}

/** Each line is written at the position the compiler computed for it, so the
 *  browser has nothing left to decide: it draws the characters it is given,
 *  where it is told, and never wraps a line of its own. */
function compileTextLines(
  layout: TextLayout,
  element: TextElement,
  font: Font,
  painting: Attribute[],
): string {
  const spans = layout.lines
    .flatMap((line) =>
      line.pieces
        .filter((piece) => !piece.missing)
        .map(
          (piece) =>
            `<tspan${attributes([
              ["x", num(piece.x)],
              ["y", num(line.baseline)],
            ])}>${escapeText(piece.text)}</tspan>`,
        ),
    )
    .join("");
  const notdefs = layout.lines
    .flatMap((line) =>
      line.pieces
        .filter((piece) => piece.missing)
        .map((piece) => notdefPath(piece, line.baseline, element, font, painting)),
    )
    .join("");
  if (spans === "") return notdefs;
  return (
    `<text${attributes([
      ["font-family", fontFamily(element.fontAssetId)],
      ["font-size", num(element.fontSize)],
      ["letter-spacing", element.letterSpacing === 0 ? undefined : num(element.letterSpacing)],
      ...painting,
      // The compiler measured the spaces it wrote, so the markup keeps every
      // one of them rather than letting SVG collapse a run into a single space.
      ["xml:space", "preserve"],
    ])}>${spans}</text>` + notdefs
  );
}

/** An invisible element compiles to nothing at all: no markup, and no
 *  definition either, so it cannot reach anything that is drawn. */
function compileElement(element: Element, context: Context): string {
  if (isVarRef(element.visible)) unresolved(element.visible);
  if (!element.visible) return "";
  switch (element.type) {
    case "rect": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const painting = [
        ...fillAttributes(element.fill, box, `fill-${xmlId(element.id)}`, context),
        ...borderAttributes(element.border),
      ];
      const shape = compileRectShape(element.cornerRadius, box, painting);
      return wrap(element, shape, box, context);
    }
    case "ellipse": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const shape = `<ellipse${attributes([
        ["cx", num(box.x + box.width / 2)],
        ["cy", num(box.y + box.height / 2)],
        ["rx", num(box.width / 2)],
        ["ry", num(box.height / 2)],
        ...fillAttributes(element.fill, box, `fill-${xmlId(element.id)}`, context),
        ...borderAttributes(element.border),
      ])}/>`;
      return wrap(element, shape, box, context);
    }
    case "vector": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const scaleX = element.viewBox.width === 0 ? 0 : box.width / element.viewBox.width;
      const scaleY = element.viewBox.height === 0 ? 0 : box.height / element.viewBox.height;
      const shape = `<path${attributes([
        ["d", element.path],
        [
          "transform",
          `translate(${num(box.x)} ${num(box.y)}) scale(${num(scaleX)} ${num(scaleY)})`,
        ],
        ...fillAttributes(element.fill, box, `fill-${xmlId(element.id)}`, context),
        ...borderAttributes(element.border),
        // The path carries the scale, so without this the stroke would be
        // scaled with it — and unevenly, whenever the two scales differ.
        ["vector-effect", element.border ? "non-scaling-stroke" : undefined],
      ])}/>`;
      return wrap(element, shape, box, context);
    }
    case "text": {
      if (isVarRef(element.color)) unresolved(element.color);
      const { font } = loadedFont(element.fontAssetId, context);
      const layout = layoutText(element, font);
      const first = layout.lines[0];
      const last = layout.lines.at(-1);
      // Empty content collapses the box to no content height, so there is
      // nothing to draw and no Font Asset to carry into the markup for it.
      if (!first || !last) return "";
      const painting = solidFillAttributes(element.color);
      const shape = compileTextLines(layout, element, font, painting);
      if (shape === "") return "";
      context.usedFonts.add(element.fontAssetId);
      const box = { x: element.x, y: layout.top, width: element.width, height: layout.height };
      const left = Math.min(...layout.lines.map((line) => line.x));
      const right = Math.max(...layout.lines.map((line) => line.x + line.width));
      const top = first.baseline - layout.ascent;
      const ink = {
        x: left,
        y: top,
        width: right - left,
        height: last.baseline + layout.descent - top,
      };
      return wrap(element, shape, box, context, ink);
    }
    default:
      throw new Error(`compiling a "${element.type}" element is not implemented yet`);
  }
}

/**
 * Compile a Design Document to SVG markup: the canvas at its own size, its
 * background beneath everything, and the elements in document order, the first
 * at the bottom. The same document compiles to the same string every time.
 */
export function compile(doc: DesignDocument, assets: AssetResolver): string {
  const context: Context = {
    assets,
    defs: [],
    fonts: loadFonts(doc, assets),
    usedFonts: new Set(),
  };
  const canvasBox = { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
  const background = `<rect${attributes([
    ["width", num(doc.canvas.width)],
    ["height", num(doc.canvas.height)],
    ...fillAttributes(doc.canvas.background, canvasBox, "canvas-background", context),
  ])}/>`;
  const elements = doc.elements
    .map((element) => compileElement(element, context))
    .filter((markup) => markup !== "");
  // The font faces come first, and only for the Font Assets something drawn
  // actually asked for, so that nothing invisible drags its bytes along.
  const faces = [...context.usedFonts].map((fontAssetId) => fontFace(fontAssetId, context));
  const styles = faces.length === 0 ? [] : [`<style>${faces.join("")}</style>`];
  const definitions = [...styles, ...context.defs];
  const defs = definitions.length === 0 ? [] : ["<defs>", ...definitions, "</defs>"];
  return [
    `<svg${attributes([
      ["xmlns", "http://www.w3.org/2000/svg"],
      ["width", num(doc.canvas.width)],
      ["height", num(doc.canvas.height)],
      ["viewBox", `0 0 ${num(doc.canvas.width)} ${num(doc.canvas.height)}`],
    ])}>`,
    ...defs,
    background,
    ...elements,
    "</svg>",
  ].join("\n");
}
