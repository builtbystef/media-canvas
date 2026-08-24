import type {
  DesignDocument,
  Element,
  GradientStop,
  LinearGradient,
  RadialGradient,
} from "@media-canvas/core";

export type CommonValue<T> = { kind: "same"; value: T } | { kind: "mixed" } | { kind: "none" };

export function selectedElements(document: DesignDocument, ids: readonly string[]): Element[] {
  const wanted = new Set(ids);
  const selected: Element[] = [];
  const visit = (elements: readonly Element[]) => {
    for (const element of elements) {
      if (wanted.has(element.id)) selected.push(element);
      if (element.type === "group") visit(element.children);
    }
  };
  visit(document.elements);
  return selected;
}

export function commonValue<T>(
  elements: readonly Element[],
  read: (element: Element) => T | undefined,
): CommonValue<T> {
  if (elements.length === 0) return { kind: "none" };
  const first = read(elements[0]!);
  if (first === undefined) return { kind: "none" };
  const serialized = JSON.stringify(first);
  return elements.slice(1).every((element) => JSON.stringify(read(element)) === serialized)
    ? { kind: "same", value: first }
    : { kind: "mixed" };
}

/** Apply one inspector commit recursively. Only edited Elements and their group
 * ancestors are replaced, preserving ADR-0006's identity-keyed preview cache. */
export function updateSelectedElements(
  document: DesignDocument,
  ids: readonly string[],
  edit: (element: Element) => Element,
): DesignDocument {
  const wanted = new Set(ids);
  const visit = (elements: Element[]): Element[] => {
    let changed = false;
    const next = elements.map((element) => {
      let candidate = element;
      if (element.type === "group") {
        const children = visit(element.children);
        if (children !== element.children) candidate = { ...element, children };
      }
      if (wanted.has(element.id)) candidate = edit(candidate);
      if (candidate !== element) changed = true;
      return candidate;
    });
    return changed ? next : elements;
  };
  const elements = visit(document.elements);
  return elements === document.elements ? document : { ...document, elements };
}

export function updateCanvas(
  document: DesignDocument,
  change: Partial<DesignDocument["canvas"]>,
): DesignDocument {
  const canvas = { ...document.canvas, ...change };
  return JSON.stringify(canvas) === JSON.stringify(document.canvas)
    ? document
    : { ...document, canvas };
}

type Gradient = LinearGradient | RadialGradient;

export function addGradientStop(gradient: Gradient, stop?: GradientStop): Gradient {
  const stops = [...gradient.stops, stop ?? stopBetween(gradient.stops)].sort(
    (left, right) => left.offset - right.offset,
  );
  return { ...gradient, stops };
}

export function updateGradientStop(
  gradient: Gradient,
  index: number,
  change: Partial<GradientStop>,
): Gradient {
  if (gradient.stops[index] === undefined) return gradient;
  const stops = gradient.stops.map((stop, candidate) =>
    candidate === index
      ? {
          ...stop,
          ...change,
          offset: Math.max(0, Math.min(1, change.offset ?? stop.offset)),
        }
      : stop,
  );
  return { ...gradient, stops };
}

export function removeGradientStop(gradient: Gradient, index: number): Gradient {
  if (gradient.stops.length <= 2 || gradient.stops[index] === undefined) return gradient;
  return { ...gradient, stops: gradient.stops.filter((_, candidate) => candidate !== index) };
}

function stopBetween(stops: readonly GradientStop[]): GradientStop {
  const sorted = [...stops].sort((left, right) => left.offset - right.offset);
  let widest = { left: sorted[0]!, right: sorted.at(-1)!, span: -1 };
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]!;
    const right = sorted[index]!;
    if (right.offset - left.offset > widest.span)
      widest = { left, right, span: right.offset - left.offset };
  }
  return {
    offset: (widest.left.offset + widest.right.offset) / 2,
    color: widest.left.color,
  };
}
