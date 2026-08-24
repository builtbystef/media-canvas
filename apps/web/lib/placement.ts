import type { DesignDocument, Element } from "@media-canvas/core";

export type ElementBounds = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type Guide = { axis: "x" | "y"; position: number };
export type AlignAction =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "middle-vertical"
  | "bottom";
export type DistributeAction = "horizontal" | "vertical";

const SNAP_THRESHOLD_SCREEN_PX = 6;

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function rotateElements(
  document: DesignDocument,
  ids: readonly string[],
  delta: number,
  boundsById: ReadonlyMap<string, ElementBounds>,
  snapToSteps = false,
): DesignDocument {
  if (ids.length === 0) return document;
  const first = findElement(document.elements, ids[0]!);
  const appliedDelta = snapToSteps
    ? ids.length === 1 && first
      ? normalizeRotation(Math.round((first.rotation + delta) / 15) * 15) - first.rotation
      : Math.round(delta / 15) * 15
    : delta;
  const selectedBounds = ids.flatMap((id) => {
    const bounds = boundsById.get(id);
    return bounds ? [bounds] : [];
  });
  const union = unionBounds(selectedBounds);
  const pivot = union ? centre(union) : null;

  return changeElements(document, new Set(ids), (element) => {
    if (ids.length === 1 || pivot === null) {
      return { ...element, rotation: normalizeRotation(element.rotation + appliedDelta) };
    }
    const bounds = boundsById.get(element.id);
    if (!bounds)
      return { ...element, rotation: normalizeRotation(element.rotation + appliedDelta) };
    const before = centre(bounds);
    const after = rotatePoint(before, pivot, appliedDelta);
    return {
      ...element,
      x: element.x + after.x - before.x,
      y: element.y + after.y - before.y,
      rotation: normalizeRotation(element.rotation + appliedDelta),
    };
  });
}

export function snapBounds(
  moving: ElementBounds,
  canvas: Pick<DesignDocument["canvas"], "width" | "height">,
  neighbours: readonly ElementBounds[],
  zoom: number,
  suspended = false,
): { dx: number; dy: number; guides: Guide[] } {
  if (suspended) return { dx: 0, dy: 0, guides: [] };
  const threshold = SNAP_THRESHOLD_SCREEN_PX / zoom;
  const x = nearestSnap(
    axisPoints(moving, "x"),
    [0, canvas.width / 2, canvas.width, ...neighbours.flatMap((item) => axisPoints(item, "x"))],
    threshold,
  );
  const y = nearestSnap(
    axisPoints(moving, "y"),
    [0, canvas.height / 2, canvas.height, ...neighbours.flatMap((item) => axisPoints(item, "y"))],
    threshold,
  );
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: [
      ...(x ? [{ axis: "x" as const, position: x.target }] : []),
      ...(y ? [{ axis: "y" as const, position: y.target }] : []),
    ],
  };
}

export function snapResizeBounds(
  moving: ElementBounds,
  handle: string,
  canvas: Pick<DesignDocument["canvas"], "width" | "height">,
  neighbours: readonly ElementBounds[],
  zoom: number,
  suspended = false,
): { dx: number; dy: number; guides: Guide[] } {
  if (suspended) return { dx: 0, dy: 0, guides: [] };
  const threshold = SNAP_THRESHOLD_SCREEN_PX / zoom;
  const x =
    handle.includes("left") || handle.includes("right")
      ? nearestResizeSnap(
          handle.includes("left") ? moving.left : moving.right,
          (moving.left + moving.right) / 2,
          [
            0,
            canvas.width / 2,
            canvas.width,
            ...neighbours.flatMap((item) => axisPoints(item, "x")),
          ],
          threshold,
        )
      : null;
  const y =
    handle.includes("top") || handle.includes("bottom")
      ? nearestResizeSnap(
          handle.includes("top") ? moving.top : moving.bottom,
          (moving.top + moving.bottom) / 2,
          [
            0,
            canvas.height / 2,
            canvas.height,
            ...neighbours.flatMap((item) => axisPoints(item, "y")),
          ],
          threshold,
        )
      : null;
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: [
      ...(x ? [{ axis: "x" as const, position: x.target }] : []),
      ...(y ? [{ axis: "y" as const, position: y.target }] : []),
    ],
  };
}

export function alignElements(
  document: DesignDocument,
  ids: readonly string[],
  action: AlignAction,
  boundsById: ReadonlyMap<string, ElementBounds>,
): DesignDocument {
  const bounds = ids.flatMap((id) => {
    const value = boundsById.get(id);
    return value ? [value] : [];
  });
  if (bounds.length === 0) return document;
  const target =
    ids.length === 1
      ? {
          id: "canvas",
          left: 0,
          top: 0,
          right: document.canvas.width,
          bottom: document.canvas.height,
        }
      : unionBounds(bounds)!;
  const shifts = new Map<string, { x: number; y: number }>();
  for (const item of bounds) shifts.set(item.id, alignmentShift(item, target, action));
  return moveById(document, shifts);
}

export function distributeElements(
  document: DesignDocument,
  ids: readonly string[],
  action: DistributeAction,
  boundsById: ReadonlyMap<string, ElementBounds>,
): DesignDocument {
  if (ids.length < 3) return document;
  const horizontal = action === "horizontal";
  const sorted = ids
    .flatMap((id) => {
      const value = boundsById.get(id);
      return value ? [value] : [];
    })
    .sort((a, b) => (horizontal ? a.left - b.left : a.top - b.top));
  if (sorted.length < 3) return document;
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const occupied = sorted.reduce(
    (total, item) => total + (horizontal ? item.right - item.left : item.bottom - item.top),
    0,
  );
  const span = horizontal ? last.right - first.left : last.bottom - first.top;
  const gap = (span - occupied) / (sorted.length - 1);
  let cursor = horizontal ? first.left : first.top;
  const shifts = new Map<string, { x: number; y: number }>();
  for (const item of sorted) {
    const start = horizontal ? item.left : item.top;
    shifts.set(item.id, horizontal ? { x: cursor - start, y: 0 } : { x: 0, y: cursor - start });
    cursor += (horizontal ? item.right - item.left : item.bottom - item.top) + gap;
  }
  return moveById(document, shifts);
}

function alignmentShift(item: ElementBounds, target: ElementBounds, action: AlignAction) {
  switch (action) {
    case "left":
      return { x: target.left - item.left, y: 0 };
    case "center-horizontal":
      return { x: (target.left + target.right - item.left - item.right) / 2, y: 0 };
    case "right":
      return { x: target.right - item.right, y: 0 };
    case "top":
      return { x: 0, y: target.top - item.top };
    case "middle-vertical":
      return { x: 0, y: (target.top + target.bottom - item.top - item.bottom) / 2 };
    case "bottom":
      return { x: 0, y: target.bottom - item.bottom };
  }
}

function moveById(document: DesignDocument, shifts: ReadonlyMap<string, { x: number; y: number }>) {
  return changeElements(document, new Set(shifts.keys()), (element) => {
    const shift = shifts.get(element.id);
    return shift ? { ...element, x: element.x + shift.x, y: element.y + shift.y } : element;
  });
}

function nearestResizeSnap(
  edge: number,
  centre: number,
  targets: readonly number[],
  threshold: number,
) {
  let nearest: { delta: number; target: number; distance: number } | null = null;
  for (const [source, factor] of [
    [edge, 1],
    [centre, 2],
  ] as const) {
    for (const target of targets) {
      const distance = target - source;
      if (
        Math.abs(distance) <= threshold &&
        (nearest === null || Math.abs(distance) < Math.abs(nearest.distance))
      ) {
        nearest = { delta: distance * factor, target, distance };
      }
    }
  }
  return nearest;
}

function nearestSnap(sources: readonly number[], targets: readonly number[], threshold: number) {
  let nearest: { delta: number; target: number } | null = null;
  for (const source of sources)
    for (const target of targets) {
      const delta = target - source;
      if (
        Math.abs(delta) <= threshold &&
        (nearest === null || Math.abs(delta) < Math.abs(nearest.delta))
      )
        nearest = { delta, target };
    }
  return nearest;
}

function axisPoints(bounds: ElementBounds, axis: "x" | "y") {
  const start = axis === "x" ? bounds.left : bounds.top;
  const end = axis === "x" ? bounds.right : bounds.bottom;
  return [start, (start + end) / 2, end];
}
function centre(bounds: ElementBounds) {
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}
function rotatePoint(
  point: { x: number; y: number },
  pivot: { x: number; y: number },
  degrees: number,
) {
  const radians = (degrees * Math.PI) / 180;
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {
    x: pivot.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: pivot.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}
function unionBounds(bounds: readonly ElementBounds[]): ElementBounds | null {
  if (bounds.length === 0) return null;
  return bounds.slice(1).reduce(
    (union, next) => ({
      id: "selection",
      left: Math.min(union.left, next.left),
      top: Math.min(union.top, next.top),
      right: Math.max(union.right, next.right),
      bottom: Math.max(union.bottom, next.bottom),
    }),
    { ...bounds[0]! },
  );
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
function changeElements(
  document: DesignDocument,
  ids: ReadonlySet<string>,
  change: (element: Element) => Element,
): DesignDocument {
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next = elements.map((element) => {
      let candidate = element;
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
