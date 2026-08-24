import type {
  CornerRadius,
  DesignDocument,
  Element,
  ImageContent,
  Shadow,
} from "@media-canvas/core";

export type Handle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type HandleDragOptions = {
  keepAspect?: boolean;
  fromCenter?: boolean;
  /** Mounted bounds are required for text, groups, and multiple selections,
   * whose complete dimensions are not stored on one Element. */
  bounds?: Bounds;
};

const CORNERS: Handle[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const RESIZE_HANDLES: Handle[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];
const TEXT_HANDLES: Handle[] = [
  "top-left",
  "top-right",
  "right",
  "bottom-right",
  "bottom-left",
  "left",
];

type PointerTarget = {
  closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

export function handleForPointerTarget(target: PointerTarget): Handle | null {
  const value = target.closest?.("[data-handle]")?.getAttribute("data-handle") ?? null;
  for (const handle of RESIZE_HANDLES) if (handle === value) return handle;
  return null;
}

export function handlesForSelection(elements: readonly Element[]): Handle[] {
  if (elements.length !== 1) return elements.length === 0 ? [] : CORNERS;
  const element = elements[0]!;
  if (element.type === "rect" || element.type === "ellipse" || element.type === "vector") {
    return RESIZE_HANDLES;
  }
  return element.type === "text" ? TEXT_HANDLES : CORNERS;
}

export function applyHandleDrag(
  document: DesignDocument,
  ids: readonly string[],
  handle: Handle,
  screenDelta: Point,
  options: HandleDragOptions = {},
): DesignDocument {
  if (ids.length === 0) return document;
  if (ids.length > 1) {
    if (!isCorner(handle) || !options.bounds) return document;
    const bounds = options.bounds;
    const factor = scaleFactor(handle, screenDelta, bounds);
    return changeElements(document, new Set(ids), (element) =>
      scaleSelectedElement(element, factor, pivotFor(handle, bounds)),
    );
  }

  const selected = findElement(document.elements, ids[0]!);
  if (!selected || !handlesForSelection([selected]).includes(handle)) return document;
  const delta = toLocal(screenDelta, selected.rotation);

  if (selected.type === "rect" || selected.type === "ellipse" || selected.type === "vector") {
    return changeElements(document, new Set(ids), (element) =>
      resizeElement(element, handle, delta, options),
    );
  }
  if (selected.type === "text" && (handle === "left" || handle === "right")) {
    return changeElements(document, new Set(ids), (element) =>
      resizeTextWidth(element, handle, delta),
    );
  }
  if (!isCorner(handle)) return document;

  const bounds =
    options.bounds ??
    ("width" in selected && "height" in selected
      ? {
          left: selected.x,
          top: selected.y,
          right: selected.x + selected.width,
          bottom: selected.y + selected.height,
        }
      : undefined);
  if (!bounds) return document;
  const factor = scaleFactor(handle, delta, {
    left: 0,
    top: 0,
    right: bounds.right - bounds.left,
    bottom: bounds.bottom - bounds.top,
  });
  const pivot = pivotFor(handle, bounds);
  return changeElements(document, new Set(ids), (element) =>
    scaleSelectedElement(element, factor, pivot),
  );
}

function resizeElement(
  element: Element,
  handle: Handle,
  delta: Point,
  options: HandleDragOptions,
): Element {
  if (!("width" in element) || !("height" in element)) return element;
  let left = includesLeft(handle) ? delta.x : 0;
  let right = includesRight(handle) ? delta.x : 0;
  let top = includesTop(handle) ? delta.y : 0;
  let bottom = includesBottom(handle) ? delta.y : 0;
  if (options.fromCenter) {
    if (includesLeft(handle)) right = -left;
    if (includesRight(handle)) left = -right;
    if (includesTop(handle)) bottom = -top;
    if (includesBottom(handle)) top = -bottom;
  }

  if (options.keepAspect) {
    const widthFactor = (element.width + right - left) / element.width;
    const heightFactor = (element.height + bottom - top) / element.height;
    const widthChanged = includesLeft(handle) || includesRight(handle);
    const heightChanged = includesTop(handle) || includesBottom(handle);
    const factor =
      !heightChanged || (widthChanged && Math.abs(widthFactor - 1) >= Math.abs(heightFactor - 1))
        ? widthFactor
        : heightFactor;
    const widthChange = element.width * (factor - 1);
    const heightChange = element.height * (factor - 1);
    [left, right] = edgeChanges(handle, "horizontal", widthChange, options.fromCenter);
    [top, bottom] = edgeChanges(handle, "vertical", heightChange, options.fromCenter);
  }

  const width = element.width + right - left;
  const height = element.height + bottom - top;
  if (width <= 0 || height <= 0) return element;
  const localCenterShift = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const centerShift = fromLocal(localCenterShift, element.rotation);
  const oldCenter = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  return {
    ...element,
    x: oldCenter.x + centerShift.x - width / 2,
    y: oldCenter.y + centerShift.y - height / 2,
    width,
    height,
  };
}

function resizeTextWidth(element: Element, handle: Handle, delta: Point): Element {
  if (element.type !== "text") return element;
  const width = element.width + (handle === "right" ? delta.x : -delta.x);
  if (width <= 0) return element;
  return { ...element, x: handle === "left" ? element.x + delta.x : element.x, width };
}

function scaleSelectedElement(element: Element, factor: number, pivot: Point): Element {
  if (!(factor > 0) || !Number.isFinite(factor)) return element;
  const positioned = {
    ...element,
    x: pivot.x + (element.x - pivot.x) * factor,
    y: pivot.y + (element.y - pivot.y) * factor,
  };
  return scaleOwnedLengths(positioned, factor);
}

function scaleOwnedLengths(element: Element, factor: number): Element {
  const decoration = {
    ...(element.type !== "group" && "border" in element && element.border
      ? { border: { ...element.border, width: element.border.width * factor } }
      : {}),
    ...(element.type !== "group" && "cornerRadius" in element && element.cornerRadius !== undefined
      ? { cornerRadius: scaleCornerRadius(element.cornerRadius, factor) }
      : {}),
    ...(element.type !== "group" && "shadow" in element && element.shadow
      ? { shadow: scaleShadow(element.shadow, factor) }
      : {}),
  };
  if (element.type === "group") {
    return {
      ...element,
      children: element.children.map((child) =>
        scaleOwnedLengths({ ...child, x: child.x * factor, y: child.y * factor }, factor),
      ),
    };
  }
  if (element.type === "text") {
    return {
      ...element,
      ...decoration,
      width: element.width * factor,
      fontSize: element.fontSize * factor,
      letterSpacing: element.letterSpacing * factor,
    };
  }
  if (element.type === "image") {
    return {
      ...element,
      ...decoration,
      width: element.width * factor,
      height: element.height * factor,
      ...(element.content ? { content: scaleImageContent(element.content, factor) } : {}),
    };
  }
  return {
    ...element,
    ...decoration,
    width: element.width * factor,
    height: element.height * factor,
  };
}

function changeElements(
  document: DesignDocument,
  ids: ReadonlySet<string>,
  change: (element: Element) => Element,
): DesignDocument {
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next = elements.map((element) => {
      let candidate: Element = element;
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) candidate = { ...element, children };
      }
      if (ids.has(element.id)) candidate = change(candidate);
      if (candidate !== element) changed = true;
      return candidate;
    });
    return changed ? next : elements;
  };
  const elements = visit(document.elements);
  return elements === document.elements ? document : { ...document, elements };
}

function findElement(elements: readonly Element[], id: string): Element | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === "group") {
      const found = findElement(element.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function edgeChanges(
  handle: Handle,
  axis: "horizontal" | "vertical",
  change: number,
  fromCenter = false,
): [number, number] {
  const atStart = axis === "horizontal" ? includesLeft(handle) : includesTop(handle);
  const atEnd = axis === "horizontal" ? includesRight(handle) : includesBottom(handle);
  if (fromCenter) return [-change / 2, change / 2];
  if (atStart) return [-change, 0];
  if (atEnd) return [0, change];
  return [-change / 2, change / 2];
}

function scaleFactor(handle: Handle, delta: Point, bounds: Bounds): number {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const horizontal = (includesLeft(handle) ? -delta.x : delta.x) / width;
  const vertical = (includesTop(handle) ? -delta.y : delta.y) / height;
  return 1 + (Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical);
}

function pivotFor(handle: Handle, bounds: Bounds): Point {
  return {
    x: includesLeft(handle) ? bounds.right : bounds.left,
    y: includesTop(handle) ? bounds.bottom : bounds.top,
  };
}

function scaleShadow(shadow: Shadow, factor: number): Shadow {
  return {
    ...shadow,
    dx: shadow.dx * factor,
    dy: shadow.dy * factor,
    blur: shadow.blur * factor,
  };
}

function scaleCornerRadius(radius: CornerRadius, factor: number): CornerRadius {
  return typeof radius === "number"
    ? radius * factor
    : {
        topLeft: radius.topLeft * factor,
        topRight: radius.topRight * factor,
        bottomRight: radius.bottomRight * factor,
        bottomLeft: radius.bottomLeft * factor,
      };
}

function scaleImageContent(content: ImageContent, factor: number): ImageContent {
  return {
    offsetX: content.offsetX * factor,
    offsetY: content.offsetY * factor,
    scale: content.scale * factor,
  };
}

function toLocal(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) + point.y * Math.sin(radians),
    y: -point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function fromLocal(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function isCorner(handle: Handle): boolean {
  return CORNERS.includes(handle);
}
function includesLeft(handle: Handle): boolean {
  return handle === "left" || handle === "top-left" || handle === "bottom-left";
}
function includesRight(handle: Handle): boolean {
  return handle === "right" || handle === "top-right" || handle === "bottom-right";
}
function includesTop(handle: Handle): boolean {
  return handle === "top" || handle === "top-left" || handle === "top-right";
}
function includesBottom(handle: Handle): boolean {
  return handle === "bottom" || handle === "bottom-left" || handle === "bottom-right";
}
