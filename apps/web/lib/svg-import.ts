import type { GroupElement, VectorElement } from "@media-canvas/core";
import { placedImageSize, type Point, type Size } from "./image-placement";

export type ImportedSvg = {
  ok: true;
  natural: Size;
  children: VectorElement[];
};

export type RefusedSvg = {
  ok: false;
  found: string[];
  message: string;
};

export type SvgImportResult = ImportedSvg | RefusedSvg;

const FORBIDDEN_ORDER = [
  "text",
  "gradients",
  "patterns",
  "filters",
  "masks",
  "clip paths",
] as const;

type Forbidden = (typeof FORBIDDEN_ORDER)[number];

const FORBIDDEN_ELEMENTS: Record<string, Forbidden> = {
  text: "text",
  tspan: "text",
  textpath: "text",
  textarea: "text",
  lineargradient: "gradients",
  radialgradient: "gradients",
  meshgradient: "gradients",
  pattern: "patterns",
  filter: "filters",
  mask: "masks",
  clippath: "clip paths",
};

type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
};

type Paint = {
  fill: string | undefined;
  stroke: string | undefined;
  strokeWidth: string | undefined;
};

/** Flatten an SVG into one single-path vector Element per path, or refuse
 *  the whole file when it carries a second renderer the compiler cannot pin. */
export function importSvg(markup: string, nextId: () => string): SvgImportResult {
  const root = parseXml(markup);
  if (root === null) {
    return refused([], "This file is not a readable SVG.");
  }
  const svg = root.name === "svg" ? root : root.children.find((child) => child.name === "svg");
  if (svg === undefined) {
    return refused([], "This file is not a readable SVG.");
  }
  const found = forbiddenIn(svg);
  if (found.length > 0) return refused(found, refusalMessage(found));

  const natural = naturalSize(svg);
  const children: VectorElement[] = [];
  const origin = viewBoxOrigin(svg.attributes.viewbox);
  collectPaths(
    svg,
    { fill: "#000000", stroke: undefined, strokeWidth: undefined },
    origin,
    (path, paint) => {
      const fill = solidColor(paint.fill) ?? "#000000";
      const stroke = solidColor(paint.stroke);
      const width = parseLength(paint.strokeWidth);
      children.push({
        id: nextId(),
        type: "vector",
        x: 0,
        y: 0,
        width: natural.width,
        height: natural.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        path,
        viewBox: { width: natural.width, height: natural.height },
        fill,
        ...(stroke !== null && width !== null && width > 0
          ? { border: { color: stroke, width } }
          : {}),
      });
    },
  );
  if (children.length === 0) {
    return refused(
      [],
      "This SVG has no paths to import. Flatten or outline the file first, then import it again.",
    );
  }
  return { ok: true, natural, children };
}

export function importedSvgGroup(
  id: string,
  imported: ImportedSvg,
  drop: Point,
  canvas: Size,
): GroupElement {
  const placed = placedImageSize(imported.natural, canvas);
  return {
    id,
    type: "group",
    x: drop.x - placed.width / 2,
    y: drop.y - placed.height / 2,
    rotation: 0,
    opacity: 1,
    visible: true,
    children: imported.children.map((child) => ({
      ...child,
      x: 0,
      y: 0,
      width: placed.width,
      height: placed.height,
    })),
  };
}

function refused(found: Forbidden[], message: string): RefusedSvg {
  return { ok: false, found, message };
}

function refusalMessage(found: readonly string[]): string {
  const named =
    found.length === 1
      ? found[0]!
      : found.length === 2
        ? `${found[0]} and ${found[1]}`
        : `${found.slice(0, -1).join(", ")}, and ${found.at(-1)}`;
  return `This SVG contains ${named}. Flatten or outline the file first, then import it again.`;
}

function forbiddenIn(root: XmlElement): Forbidden[] {
  const found = new Set<Forbidden>();
  const visit = (element: XmlElement) => {
    const fromName = FORBIDDEN_ELEMENTS[element.name];
    if (fromName !== undefined) found.add(fromName);
    if (element.name.startsWith("fe") && element.name !== "fetch") found.add("filters");
    if (
      hasUrlPaint(element.attributes["clip-path"]) ||
      hasUrlPaint(styleValue(element, "clip-path"))
    ) {
      found.add("clip paths");
    }
    if (hasUrlPaint(element.attributes.mask) || hasUrlPaint(styleValue(element, "mask"))) {
      found.add("masks");
    }
    if (hasUrlPaint(element.attributes.filter) || hasUrlPaint(styleValue(element, "filter"))) {
      found.add("filters");
    }
    const fill = element.attributes.fill ?? styleValue(element, "fill");
    const stroke = element.attributes.stroke ?? styleValue(element, "stroke");
    if (hasUrlPaint(fill) || hasUrlPaint(stroke)) found.add("gradients");
    for (const child of element.children) visit(child);
  };
  visit(root);
  return FORBIDDEN_ORDER.filter((item) => found.has(item));
}

function hasUrlPaint(value: string | undefined): boolean {
  return value !== undefined && /url\s*\(/i.test(value);
}

function styleValue(element: XmlElement, property: string): string | undefined {
  return parseStyle(element.attributes.style)[property];
}

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function collectPaths(
  element: XmlElement,
  inherited: Paint,
  parent: Matrix,
  emit: (path: string, paint: Paint) => void,
): void {
  const style = parseStyle(element.attributes.style);
  const paint: Paint = {
    fill: style.fill ?? element.attributes.fill ?? inherited.fill,
    stroke: style.stroke ?? element.attributes.stroke ?? inherited.stroke,
    strokeWidth:
      style["stroke-width"] ?? element.attributes["stroke-width"] ?? inherited.strokeWidth,
  };
  const matrix = multiply(parent, parseTransform(element.attributes.transform));
  const path = shapePath(element);
  if (path !== null) emit(transformPath(path, matrix), paint);
  for (const child of element.children) collectPaths(child, paint, matrix, emit);
}

function naturalSize(svg: XmlElement): Size {
  const viewBox = parseViewBox(svg.attributes.viewbox);
  if (viewBox !== null) return viewBox;
  const width = parseLength(svg.attributes.width);
  const height = parseLength(svg.attributes.height);
  if (width !== null && height !== null && width > 0 && height > 0) {
    return { width, height };
  }
  return { width: 100, height: 100 };
}

function parseViewBox(value: string | undefined): Size | null {
  const box = parseViewBoxOrigin(value);
  return box === null ? null : { width: box.width, height: box.height };
}

function parseViewBoxOrigin(
  value: string | undefined,
): { x: number; y: number; width: number; height: number } | null {
  if (value === undefined) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((part) => Number.isFinite(part));
  if (parts.length !== 4) return null;
  const width = parts[2]!;
  const height = parts[3]!;
  if (width < 0 || height < 0) return null;
  return { x: parts[0]!, y: parts[1]!, width, height };
}

function viewBoxOrigin(value: string | undefined): Matrix {
  const box = parseViewBoxOrigin(value);
  if (box === null || (box.x === 0 && box.y === 0)) return IDENTITY;
  return [1, 0, 0, 1, -box.x, -box.y];
}

function shapePath(element: XmlElement): string | null {
  const n = (name: string, fallback = 0) => parseLength(element.attributes[name]) ?? fallback;
  switch (element.name) {
    case "path":
      return element.attributes.d?.trim() || null;
    case "rect": {
      const x = n("x");
      const y = n("y");
      const width = n("width");
      const height = n("height");
      if (width <= 0 || height <= 0) return null;
      return `M ${fmt(x)} ${fmt(y)} H ${fmt(x + width)} V ${fmt(y + height)} H ${fmt(x)} Z`;
    }
    case "circle": {
      const cx = n("cx");
      const cy = n("cy");
      const r = n("r");
      if (r <= 0) return null;
      return ellipsePath(cx, cy, r, r);
    }
    case "ellipse": {
      const rx = n("rx");
      const ry = n("ry");
      if (rx <= 0 || ry <= 0) return null;
      return ellipsePath(n("cx"), n("cy"), rx, ry);
    }
    case "line":
      return `M ${fmt(n("x1"))} ${fmt(n("y1"))} L ${fmt(n("x2"))} ${fmt(n("y2"))}`;
    case "polyline":
    case "polygon": {
      const points = parseNumbers(element.attributes.points ?? "");
      if (points.length < 4) return null;
      const cmds = [`M ${fmt(points[0]!)} ${fmt(points[1]!)}`];
      for (let i = 2; i + 1 < points.length; i += 2) {
        cmds.push(`L ${fmt(points[i]!)} ${fmt(points[i + 1]!)}`);
      }
      if (element.name === "polygon") cmds.push("Z");
      return cmds.join(" ");
    }
    default:
      return null;
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * 0.5522847498;
  const ky = ry * 0.5522847498;
  return [
    `M ${fmt(cx + rx)} ${fmt(cy)}`,
    `C ${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`,
    `C ${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)}`,
    `C ${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`,
    `C ${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)}`,
    "Z",
  ].join(" ");
}

function parseTransform(value: string | undefined): Matrix {
  if (value === undefined || value.trim() === "") return IDENTITY;
  let matrix = IDENTITY;
  const functions = value.matchAll(/(matrix|translate|scale|rotate|skewx|skewy)\s*\(([^)]*)\)/gi);
  for (const match of functions) {
    matrix = multiply(matrix, transformOf(match[1]!.toLowerCase(), parseNumbers(match[2]!)));
  }
  return matrix;
}

function transformOf(name: string, args: number[]): Matrix {
  switch (name) {
    case "matrix":
      return [args[0] ?? 1, args[1] ?? 0, args[2] ?? 0, args[3] ?? 1, args[4] ?? 0, args[5] ?? 0];
    case "translate":
      return [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    case "scale": {
      const sx = args[0] ?? 1;
      return [sx, 0, 0, args[1] ?? sx, 0, 0];
    }
    case "rotate": {
      const angle = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      return multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [
        1,
        0,
        0,
        1,
        -cx,
        -cy,
      ]);
    }
    case "skewx": {
      const angle = ((args[0] ?? 0) * Math.PI) / 180;
      return [1, 0, Math.tan(angle), 1, 0, 0];
    }
    case "skewy": {
      const angle = ((args[0] ?? 0) * Math.PI) / 180;
      return [1, Math.tan(angle), 0, 1, 0, 0];
    }
    default:
      return IDENTITY;
  }
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function isIdentity(matrix: Matrix): boolean {
  return matrix.every((value, index) => value === IDENTITY[index]);
}

function transformPath(d: string, matrix: Matrix): string {
  if (isIdentity(matrix)) return d;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const parts: string[] = [];
  const point = (px: number, py: number, relative: boolean): [number, number] => {
    x = relative ? x + px : px;
    y = relative ? y + py : py;
    return applyMatrix(matrix, x, y);
  };
  for (const command of parsePath(d)) {
    const relative = command.type === command.type.toLowerCase();
    const kind = command.type.toUpperCase();
    const values = command.values;
    if (kind === "Z") {
      parts.push("Z");
      x = startX;
      y = startY;
      continue;
    }
    if (kind === "M" || kind === "L") {
      for (let i = 0; i + 1 < values.length; i += 2) {
        const [px, py] = point(values[i]!, values[i + 1]!, relative);
        const letter = kind === "M" && i === 0 ? "M" : "L";
        if (kind === "M" && i === 0) {
          startX = x;
          startY = y;
        }
        parts.push(`${letter} ${fmt(px)} ${fmt(py)}`);
      }
      continue;
    }
    if (kind === "H") {
      for (const value of values) {
        x = relative ? x + value : value;
        const [px, py] = applyMatrix(matrix, x, y);
        parts.push(`L ${fmt(px)} ${fmt(py)}`);
      }
      continue;
    }
    if (kind === "V") {
      for (const value of values) {
        y = relative ? y + value : value;
        const [px, py] = applyMatrix(matrix, x, y);
        parts.push(`L ${fmt(px)} ${fmt(py)}`);
      }
      continue;
    }
    if (kind === "C") {
      for (let i = 0; i + 5 < values.length; i += 6) {
        const controls: [number, number][] = [];
        let nextX = x;
        let nextY = y;
        for (let k = 0; k < 6; k += 2) {
          nextX = relative ? x + values[i + k]! : values[i + k]!;
          nextY = relative ? y + values[i + k + 1]! : values[i + k + 1]!;
          controls.push(applyMatrix(matrix, nextX, nextY));
        }
        x = nextX;
        y = nextY;
        const [c1, c2, end] = controls;
        parts.push(
          `C ${fmt(c1![0])} ${fmt(c1![1])} ${fmt(c2![0])} ${fmt(c2![1])} ${fmt(end![0])} ${fmt(end![1])}`,
        );
      }
      continue;
    }
    if (kind === "S") {
      for (let i = 0; i + 3 < values.length; i += 4) {
        const x2 = relative ? x + values[i]! : values[i]!;
        const y2 = relative ? y + values[i + 1]! : values[i + 1]!;
        const x3 = relative ? x + values[i + 2]! : values[i + 2]!;
        const y3 = relative ? y + values[i + 3]! : values[i + 3]!;
        const [p2x, p2y] = applyMatrix(matrix, x2, y2);
        const [p3x, p3y] = applyMatrix(matrix, x3, y3);
        parts.push(`S ${fmt(p2x)} ${fmt(p2y)} ${fmt(p3x)} ${fmt(p3y)}`);
        x = x3;
        y = y3;
      }
      continue;
    }
    if (kind === "Q") {
      for (let i = 0; i + 3 < values.length; i += 4) {
        const x1 = relative ? x + values[i]! : values[i]!;
        const y1 = relative ? y + values[i + 1]! : values[i + 1]!;
        const x2 = relative ? x + values[i + 2]! : values[i + 2]!;
        const y2 = relative ? y + values[i + 3]! : values[i + 3]!;
        const [p1x, p1y] = applyMatrix(matrix, x1, y1);
        const [p2x, p2y] = applyMatrix(matrix, x2, y2);
        parts.push(`Q ${fmt(p1x)} ${fmt(p1y)} ${fmt(p2x)} ${fmt(p2y)}`);
        x = x2;
        y = y2;
      }
      continue;
    }
    if (kind === "T") {
      for (let i = 0; i + 1 < values.length; i += 2) {
        const [px, py] = point(values[i]!, values[i + 1]!, relative);
        parts.push(`T ${fmt(px)} ${fmt(py)}`);
      }
      continue;
    }
    if (kind === "A") {
      for (let i = 0; i + 6 < values.length; i += 7) {
        const endX = relative ? x + values[i + 5]! : values[i + 5]!;
        const endY = relative ? y + values[i + 6]! : values[i + 6]!;
        const cubics = arcToCubics(
          x,
          y,
          values[i]!,
          values[i + 1]!,
          values[i + 2]!,
          values[i + 3]!,
          values[i + 4]!,
          endX,
          endY,
        );
        for (const cubic of cubics) {
          const c1 = applyMatrix(matrix, cubic[0], cubic[1]);
          const c2 = applyMatrix(matrix, cubic[2], cubic[3]);
          const end = applyMatrix(matrix, cubic[4], cubic[5]);
          parts.push(
            `C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(end[0])} ${fmt(end[1])}`,
          );
        }
        x = endX;
        y = endY;
      }
    }
  }
  return parts.join(" ");
}

function parsePath(d: string): { type: string; values: number[] }[] {
  const commands: { type: string; values: number[] }[] = [];
  for (const match of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    commands.push({ type: match[1]!, values: parseNumbers(match[2]!) });
  }
  return commands;
}

function parseNumbers(value: string): number[] {
  return [...value.matchAll(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g)].map((match) =>
    Number(match[0]),
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round((value + 0) * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Endpoint-parameterized SVG arc to cubics, then the caller transforms them. */
function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  angle: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): [number, number, number, number, number, number][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [];
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rxAbs *= scale;
    ryAbs *= scale;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const numerator =
    rxAbs * rxAbs * ryAbs * ryAbs - rxAbs * rxAbs * y1p * y1p - ryAbs * ryAbs * x1p * x1p;
  const denom = rxAbs * rxAbs * y1p * y1p + ryAbs * ryAbs * x1p * x1p;
  const coef = denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, numerator / denom));
  const cxp = (coef * rxAbs * y1p) / ryAbs;
  const cyp = (-coef * ryAbs * x1p) / rxAbs;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const start = vectorAngle((x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs);
  let delta = vectorAngle(-(x1p + cxp) / rxAbs, -(y1p + cyp) / ryAbs) - start;
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep !== 0 && delta < 0) delta += 2 * Math.PI;
  const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2));
  const step = delta / segments;
  const cubics: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < segments; i += 1) {
    const theta1 = start + i * step;
    const theta2 = theta1 + step;
    const alpha = (4 / 3) * Math.tan(step / 4);
    const p1 = arcPoint(cx, cy, rxAbs, ryAbs, cos, sin, theta1);
    const p2 = arcPoint(cx, cy, rxAbs, ryAbs, cos, sin, theta2);
    const t1 = arcTangent(rxAbs, ryAbs, cos, sin, theta1);
    const t2 = arcTangent(rxAbs, ryAbs, cos, sin, theta2);
    cubics.push([
      p1[0] + alpha * t1[0],
      p1[1] + alpha * t1[1],
      p2[0] - alpha * t2[0],
      p2[1] - alpha * t2[1],
      p2[0],
      p2[1],
    ]);
  }
  return cubics;
}

function vectorAngle(ux: number, uy: number): number {
  return Math.atan2(uy, ux);
}

function arcPoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cos: number,
  sin: number,
  theta: number,
): [number, number] {
  const x = rx * Math.cos(theta);
  const y = ry * Math.sin(theta);
  return [cx + cos * x - sin * y, cy + sin * x + cos * y];
}

function arcTangent(
  rx: number,
  ry: number,
  cos: number,
  sin: number,
  theta: number,
): [number, number] {
  const x = -rx * Math.sin(theta);
  const y = ry * Math.cos(theta);
  return [cos * x - sin * y, sin * x + cos * y];
}

function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(value.trim());
  if (match === null) return null;
  return Number(match[1]);
}

function parseStyle(value: string | undefined): Record<string, string> {
  if (value === undefined || value === "") return {};
  const declared: Record<string, string> = {};
  for (const item of value.split(";")) {
    const split = item.indexOf(":");
    if (split < 0) continue;
    const property = item.slice(0, split).trim().toLowerCase();
    const parsed = item.slice(split + 1).trim();
    if (property !== "" && parsed !== "") declared[property] = parsed;
  }
  return declared;
}

function solidColor(value: string | undefined): string | null {
  if (value === undefined) return null;
  const raw = value.trim();
  if (raw === "" || /^none$/i.test(raw)) return null;
  if (/^transparent$/i.test(raw)) return "#00000000";
  if (/^url\s*\(/i.test(raw)) return null;
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
      return `#${hex}`.toUpperCase();
    }
    return null;
  }
  const rgb =
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(raw);
  if (rgb !== null) {
    const channel = (part: string) => Math.max(0, Math.min(255, Math.round(Number(part))));
    const r = channel(rgb[1]!);
    const g = channel(rgb[2]!);
    const b = channel(rgb[3]!);
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    if (rgb[4] === undefined) return hex;
    return `${hex}${toHex(Math.round(Math.max(0, Math.min(1, Number(rgb[4]))) * 255))}`;
  }
  return NAMED_COLORS[raw.toLowerCase()] ?? null;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  gray: "#808080",
  grey: "#808080",
};

function parseXml(source: string): XmlElement | null {
  const text = source.replace(/^\uFEFF/, "");
  let index = 0;

  const skipWs = () => {
    while (index < text.length && /\s/.test(text[index]!)) index += 1;
  };
  const starts = (part: string) => text.startsWith(part, index);
  const skipUntil = (end: string) => {
    const at = text.indexOf(end, index);
    if (at < 0) return false;
    index = at + end.length;
    return true;
  };
  const readName = () => {
    const start = index;
    if (!/[A-Za-z_:]/.test(text[index] ?? "")) return "";
    index += 1;
    while (index < text.length && /[A-Za-z0-9_:.-]/.test(text[index]!)) index += 1;
    return text.slice(start, index);
  };
  const decode = (value: string) =>
    value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");

  const readAttributes = (): Record<string, string> | null => {
    const attributes: Record<string, string> = {};
    while (index < text.length) {
      skipWs();
      if (index >= text.length || text[index] === "/" || text[index] === ">") return attributes;
      const rawName = readName();
      if (rawName === "") return null;
      skipWs();
      let value = "";
      if (text[index] === "=") {
        index += 1;
        skipWs();
        const quote = text[index];
        if (quote !== '"' && quote !== "'") return null;
        index += 1;
        const end = text.indexOf(quote, index);
        if (end < 0) return null;
        value = decode(text.slice(index, end));
        index = end + 1;
      }
      attributes[localName(rawName)] = value;
    }
    return null;
  };

  const readElement = (): XmlElement | null => {
    while (index < text.length) {
      skipWs();
      if (starts("<?")) {
        if (!skipUntil("?>")) return null;
        continue;
      }
      if (starts("<!--")) {
        if (!skipUntil("-->")) return null;
        continue;
      }
      if (starts("<![CDATA[")) {
        if (!skipUntil("]]>")) return null;
        continue;
      }
      if (starts("<!")) {
        if (!skipUntil(">")) return null;
        continue;
      }
      break;
    }
    if (!starts("<") || starts("</")) return null;
    index += 1;
    const rawName = readName();
    if (rawName === "") return null;
    const attributes = readAttributes();
    if (attributes === null) return null;
    skipWs();
    if (starts("/>")) {
      index += 2;
      return { name: localName(rawName), attributes, children: [] };
    }
    if (text[index] !== ">") return null;
    index += 1;
    const children: XmlElement[] = [];
    while (index < text.length) {
      const next = text.indexOf("<", index);
      if (next < 0) return null;
      index = next;
      if (starts("</")) {
        index += 2;
        readName();
        skipWs();
        if (text[index] === ">") index += 1;
        return { name: localName(rawName), attributes, children };
      }
      const child = readElement();
      if (child === null) return null;
      children.push(child);
    }
    return null;
  };

  const parsed = readElement();
  return parsed;
}

function localName(name: string): string {
  const split = name.split(":");
  return (split.at(-1) ?? name).toLowerCase();
}
