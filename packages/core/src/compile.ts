import type { Font } from "opentype.js";
import { parse as parseFont } from "opentype.js";

import type { AssetResolver } from "./assets.ts";
import { fontFormatOf } from "./fonts.ts";
import type {
  Border,
  CornerRadius,
  DesignDocument,
  Element,
  Fill,
  GradientStop,
  GroupElement,
  ImageElement,
  Shadow,
  TextElement,
  VarRef,
} from "./document.ts";
import type { TextLayout, TextPiece } from "./text.ts";
import { layoutText } from "./text.ts";

type Box = { x: number; y: number; width: number; height: number };

type LoadedFont = { bytes: ArrayBuffer; font: Font };

type LoadedImage = { url: string; size?: { width: number; height: number } };

export type Definition = { id: string; markup: string };

export type CompiledElement = {
  markup: string;
  definitions: Definition[];
  fonts: string[];
};

export type Caches = {
  layouts: WeakMap<TextElement, TextLayout>;
  markup: WeakMap<Element, CompiledElement>;
  fonts: Map<string, LoadedFont>;
  faces: Map<string, string>;
};

export function newCaches(): Caches {
  return { layouts: new WeakMap(), markup: new WeakMap(), fonts: new Map(), faces: new Map() };
}

type Context = {
  defs: Definition[];
  fonts: Map<string, LoadedFont>;
  images: Map<string, LoadedImage>;
  usedFonts: Set<string>;
  caches: Caches;
};

function define(context: Context, id: string, markup: string): void {
  context.defs.push({ id, markup });
}

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

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function num(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function isVarRef(value: unknown): value is VarRef {
  return typeof value === "object" && value !== null && "$var" in value;
}

function unresolved(reference: VarRef): never {
  throw new Error(
    `compile received an unresolved reference to the Variable "${reference.$var}" — ` +
      "resolve the document before compiling it",
  );
}

function paint(color: string): { color: string; opacity: string | undefined } {
  if (color.length !== 9) return { color, opacity: undefined };
  return { color: color.slice(0, 7), opacity: num(alphaOf(color)) };
}

function alphaOf(color: string): number {
  return color.length === 9 ? Number.parseInt(color.slice(7), 16) / 255 : 1;
}

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

function fillAttributes(fill: Fill | VarRef, box: Box, id: string, context: Context): Attribute[] {
  if (isVarRef(fill)) unresolved(fill);
  if (typeof fill === "string") return solidFillAttributes(fill);
  if (fill.type === "linear") {
    const line = gradientLine(fill.angle, box);
    define(
      context,
      id,
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
    define(
      context,
      id,
      `<radialGradient${attributes([["id", id]])}>${compileStops(fill.stops)}</radialGradient>`,
    );
  }
  return [["fill", `url(#${id})`]];
}

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

function compileRectShape(
  cornerRadius: CornerRadius | undefined,
  box: Box,
  painting: Attribute[],
  named: Attribute[] = [],
): string {
  if (typeof cornerRadius === "object") {
    return `<path${attributes([
      ...named,
      ["d", roundedRectPath(cornerRadius, box)],
      ...painting,
    ])}/>`;
  }
  return `<rect${attributes([
    ...named,
    ["x", num(box.x)],
    ["y", num(box.y)],
    ["width", num(box.width)],
    ["height", num(box.height)],
    ["rx", cornerRadius ? num(cornerRadius) : undefined],
    ...painting,
  ])}/>`;
}

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
    ["color-interpolation-filters", "sRGB"],
  ])}><feDropShadow${attributes([
    ["dx", num(shadow.dx)],
    ["dy", num(shadow.dy)],
    ["stdDeviation", num(deviation)],
    ["flood-color", paint(shadow.color).color],
    ["flood-opacity", num(alphaOf(shadow.color) * shadow.opacity)],
  ])}/></filter>`;
}

function fontFamily(fontAssetId: string): string {
  return `font-${xmlId(fontAssetId)}`;
}

function fontFormat(bytes: ArrayBuffer): { mime: string; format: string } {
  return fontFormatOf(bytes) === "otf"
    ? { mime: "font/otf", format: "opentype" }
    : { mime: "font/ttf", format: "truetype" };
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let index = 0; index < view.length; index += 0x80_00) {
    chunks.push(String.fromCharCode(...view.subarray(index, index + 0x80_00)));
  }
  return btoa(chunks.join(""));
}

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

function textElementsByFont(elements: Element[], into: Map<string, string[]>): void {
  for (const element of elements) {
    if (element.type === "text")
      into.set(element.fontAssetId, [...(into.get(element.fontAssetId) ?? []), element.id]);
    else if (element.type === "group") textElementsByFont(element.children, into);
  }
}

function imageElementsBySrc(elements: Element[], into: Map<string, ImageElement[]>): void {
  for (const element of elements) {
    if (element.type === "image") {
      if (isVarRef(element.src)) unresolved(element.src);
      into.set(element.src, [...(into.get(element.src) ?? []), element]);
    } else if (element.type === "group") imageElementsBySrc(element.children, into);
  }
}

function loadAssets<T>(
  referenced: Map<string, string[]>,
  take: (assetId: string) => T,
  complaint: string,
): Map<string, T> {
  const loaded = new Map<string, T>();
  const failures: string[] = [];
  for (const [assetId, elementIds] of referenced) {
    try {
      loaded.set(assetId, take(assetId));
    } catch (cause) {
      const elements = elementIds.map((id) => `"${id}"`).join(", ");
      const reason = cause instanceof Error ? cause.message : String(cause);
      failures.push(`"${assetId}", referenced by ${elements}: ${reason}`);
    }
  }
  if (failures.length > 0) throw new Error(`${complaint} — ${failures.join("; ")}`);
  return loaded;
}

function loadFonts(
  doc: DesignDocument,
  assets: AssetResolver,
  caches: Caches,
): Map<string, LoadedFont> {
  const referenced = new Map<string, string[]>();
  textElementsByFont(doc.elements, referenced);
  return loadAssets(
    referenced,
    (fontAssetId) => {
      const held = caches.fonts.get(fontAssetId);
      if (held) return held;
      const bytes = assets.fontBytes(fontAssetId);
      const loaded = { bytes, font: parseFont(bytes) };
      caches.fonts.set(fontAssetId, loaded);
      return loaded;
    },
    "compile could not load every Font Asset the document references",
  );
}

function loadImages(doc: DesignDocument, assets: AssetResolver): Map<string, LoadedImage> {
  const elementsBySrc = new Map<string, ImageElement[]>();
  imageElementsBySrc(doc.elements, elementsBySrc);
  const referenced = new Map<string, string[]>(
    [...elementsBySrc].map(([src, elements]) => [src, elements.map((element) => element.id)]),
  );
  return loadAssets(
    referenced,
    (src) =>
      (elementsBySrc.get(src) ?? []).some(needsIntrinsicSize)
        ? { url: assets.imageUrl(src), size: assets.imageSize(src) }
        : { url: assets.imageUrl(src) },
    "compile could not supply every Image Asset the document references",
  );
}

function needsIntrinsicSize(element: ImageElement): boolean {
  return element.content === undefined && element.fitMode !== "stretch";
}

function needsGroup(element: Element, severalNodes = false): boolean {
  const shadow = "shadow" in element ? element.shadow : undefined;
  return severalNodes || element.rotation !== 0 || element.opacity !== 1 || shadow !== undefined;
}

function nameOf(element: Element, grouped: boolean): Attribute[] {
  return grouped ? [] : [["data-element", element.id]];
}

function wrap(
  element: Element,
  shape: string,
  box: Box,
  context: Context,
  inkBox: Box = box,
  severalNodes = false,
): string {
  const shadow = "shadow" in element ? element.shadow : undefined;
  const border = "border" in element ? element.border : undefined;
  if (!needsGroup(element, severalNodes)) return shape;
  const filterId = `shadow-${xmlId(element.id)}`;
  if (shadow) define(context, filterId, shadowFilter(shadow, filterId, inkBox, border));
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return `<g${attributes([
    ["data-element", element.id],
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
      ["xml:space", "preserve"],
    ])}>${spans}</text>` + notdefs
  );
}

function loadedImage(src: string, context: Context): LoadedImage {
  const loaded = context.images.get(src);
  if (!loaded) throw new Error(`compile holds no Image Asset for the source "${src}"`);
  return loaded;
}

function imageBox(element: ImageElement, frame: Box, src: string, context: Context): Box {
  const crop = element.content;
  if (crop) {
    return {
      x: frame.x + crop.offsetX,
      y: frame.y + crop.offsetY,
      width: element.naturalWidth * crop.scale,
      height: element.naturalHeight * crop.scale,
    };
  }
  if (element.fitMode === "stretch") return frame;
  const natural = loadedImage(src, context).size;
  if (!natural || natural.width === 0 || natural.height === 0) {
    return { ...frame, width: 0, height: 0 };
  }
  const horizontal = frame.width / natural.width;
  const vertical = frame.height / natural.height;
  const scale =
    element.fitMode === "cover" ? Math.max(horizontal, vertical) : Math.min(horizontal, vertical);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

function imageShape(element: ImageElement, frame: Box, painting: Attribute[]): string {
  if (element.clip === "ellipse") {
    return `<ellipse${attributes([
      ["cx", num(frame.x + frame.width / 2)],
      ["cy", num(frame.y + frame.height / 2)],
      ["rx", num(frame.width / 2)],
      ["ry", num(frame.height / 2)],
      ...painting,
    ])}/>`;
  }
  if (typeof element.clip === "object") {
    return `<path${attributes([
      ["d", element.clip.path],
      ["transform", `translate(${num(frame.x)} ${num(frame.y)})`],
      ...painting,
    ])}/>`;
  }
  return compileRectShape(element.cornerRadius, frame, painting);
}

function compileImage(
  element: ImageElement,
  frame: Box,
  context: Context,
  named: Attribute[] = [],
): string {
  if (isVarRef(element.src)) unresolved(element.src);
  const src = element.src;
  const clipId = `clip-${xmlId(element.id)}`;
  define(
    context,
    clipId,
    `<clipPath${attributes([["id", clipId]])}>${imageShape(element, frame, [])}</clipPath>`,
  );
  const box = imageBox(element, frame, src, context);
  const drawn = `<image${attributes([
    ...named,
    ["href", loadedImage(src, context).url],
    ["x", num(box.x)],
    ["y", num(box.y)],
    ["width", num(box.width)],
    ["height", num(box.height)],
    ["preserveAspectRatio", "none"],
    ["clip-path", `url(#${clipId})`],
  ])}/>`;
  if (!element.border) return drawn;
  const border = imageShape(element, frame, [
    ["fill", "none"],
    ...borderAttributes(element.border),
  ]);
  return drawn + border;
}

function rotatedBounds(box: Box, degrees: number): Box {
  if (degrees === 0) return box;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = box.width * cos + box.height * sin;
  const height = box.width * sin + box.height * cos;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

function union(boxes: Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function ownBox(element: Element, context: Context): Box | undefined {
  if (element.type === "group") {
    const inside = childrenBounds(element, context);
    return inside && { ...inside, x: inside.x + element.x, y: inside.y + element.y };
  }
  if (element.type === "text") {
    const layout = layoutOf(element, context);
    if (layout.lines.length === 0) return undefined;
    return { x: element.x, y: layout.top, width: element.width, height: layout.height };
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

function elementBounds(element: Element, context: Context): Box | undefined {
  if (isVarRef(element.visible)) unresolved(element.visible);
  if (!element.visible) return undefined;
  const own = ownBox(element, context);
  return own && rotatedBounds(own, element.rotation);
}

function childrenBounds(group: GroupElement, context: Context): Box | undefined {
  const boxes = group.children
    .map((child) => elementBounds(child, context))
    .filter((box) => box !== undefined);
  return union(boxes);
}

function layoutOf(element: TextElement, context: Context): TextLayout {
  const cached = context.caches.layouts.get(element);
  if (cached) return cached;
  const layout = layoutText(element, loadedFont(element.fontAssetId, context).font);
  context.caches.layouts.set(element, layout);
  return layout;
}

function compileElement(element: Element, context: Context): string {
  const cached = context.caches.markup.get(element);
  if (cached) {
    adopt(cached, context);
    return cached.markup;
  }
  const own: Context = { ...context, defs: [], usedFonts: new Set() };
  const markup = compileOwnMarkup(element, own);
  const compiled = { markup, definitions: own.defs, fonts: [...own.usedFonts] };
  context.caches.markup.set(element, compiled);
  adopt(compiled, context);
  return markup;
}

function adopt(compiled: CompiledElement, context: Context): void {
  context.defs.push(...compiled.definitions);
  for (const fontAssetId of compiled.fonts) context.usedFonts.add(fontAssetId);
}

function compileOwnMarkup(element: Element, context: Context): string {
  if (isVarRef(element.visible)) unresolved(element.visible);
  if (!element.visible) return "";
  switch (element.type) {
    case "rect": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const painting = [
        ...fillAttributes(element.fill, box, `fill-${xmlId(element.id)}`, context),
        ...borderAttributes(element.border),
      ];
      const shape = compileRectShape(
        element.cornerRadius,
        box,
        painting,
        nameOf(element, needsGroup(element)),
      );
      return wrap(element, shape, box, context);
    }
    case "ellipse": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const shape = `<ellipse${attributes([
        ...nameOf(element, needsGroup(element)),
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
        ...nameOf(element, needsGroup(element)),
        ["d", element.path],
        [
          "transform",
          `translate(${num(box.x)} ${num(box.y)}) scale(${num(scaleX)} ${num(scaleY)})`,
        ],
        ...fillAttributes(element.fill, box, `fill-${xmlId(element.id)}`, context),
        ...borderAttributes(element.border),
        ["vector-effect", element.border ? "non-scaling-stroke" : undefined],
      ])}/>`;
      return wrap(element, shape, box, context);
    }
    case "image": {
      const box = { x: element.x, y: element.y, width: element.width, height: element.height };
      const severalNodes = element.border !== undefined;
      const grouped = needsGroup(element, severalNodes);
      const drawn = compileImage(element, box, context, nameOf(element, grouped));
      return wrap(element, drawn, box, context, box, severalNodes);
    }
    case "text": {
      if (isVarRef(element.color)) unresolved(element.color);
      const { font } = loadedFont(element.fontAssetId, context);
      const layout = layoutOf(element, context);
      const first = layout.lines[0];
      const last = layout.lines.at(-1);
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
      return wrap(element, shape, box, context, ink, true);
    }
    case "group": {
      const children = element.children.map((child) => compileElement(child, context)).join("");
      if (children === "") return "";
      const origin =
        element.x === 0 && element.y === 0
          ? undefined
          : `translate(${num(element.x)} ${num(element.y)})`;
      const inside = element.rotation === 0 ? undefined : childrenBounds(element, context);
      const turn = inside
        ? `rotate(${num(element.rotation)} ${num(inside.x + inside.width / 2)} ` +
          `${num(inside.y + inside.height / 2)})`
        : undefined;
      const transform = [origin, turn].filter((part) => part !== undefined).join(" ");
      return `<g${attributes([
        ["data-element", element.id],
        ["transform", transform === "" ? undefined : transform],
        ["opacity", element.opacity === 1 ? undefined : num(element.opacity)],
      ])}>${children}</g>`;
    }
  }
}

export function compile(doc: DesignDocument, assets: AssetResolver): string {
  return compileDocument(doc, assets, newCaches());
}

export function compileDocument(
  doc: DesignDocument,
  assets: AssetResolver,
  caches: Caches,
): string {
  const context = contextFor(doc, assets, caches);
  const canvasBox = { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height };
  const background = `<rect${attributes([
    ["width", num(doc.canvas.width)],
    ["height", num(doc.canvas.height)],
    ...fillAttributes(doc.canvas.background, canvasBox, "canvas-background", context),
  ])}/>`;
  const elements = doc.elements
    .map((element) => compileElement(element, context))
    .filter((markup) => markup !== "");
  const styles = fontFaces(context);
  const definitions = [...styles, ...context.defs.map((definition) => definition.markup)];
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

export function compileElementOf(
  doc: DesignDocument,
  element: Element,
  assets: AssetResolver,
  caches: Caches,
): CompiledElement {
  const context = contextFor(doc, assets, caches);
  compileElement(element, context);
  const compiled = caches.markup.get(element);
  if (!compiled) throw new Error(`compile left no markup for the element "${element.id}"`);
  return compiled;
}

function contextFor(doc: DesignDocument, assets: AssetResolver, caches: Caches): Context {
  return {
    defs: [],
    fonts: loadFonts(doc, assets, caches),
    images: loadImages(doc, assets),
    usedFonts: new Set(),
    caches,
  };
}

function fontFaces(context: Context): string[] {
  const used = [...context.usedFonts];
  if (used.length === 0) return [];
  const key = used.join(" ");
  const cached = context.caches.faces.get(key);
  if (cached !== undefined) return [cached];
  const block = `<style>${used.map((fontAssetId) => fontFace(fontAssetId, context)).join("")}</style>`;
  context.caches.faces.set(key, block);
  return [block];
}
