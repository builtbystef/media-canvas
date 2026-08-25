// The Design Document schema, v1 (ADR-0001). These types are the contract at
// every seam: the editor authors them, the compiler reads them, and the render
// worker never sees anything else. `validateDocument` is the one authority on
// whether unknown input is a valid v1 document.

/** The `schemaVersion` this core accepts. `migrateDocument` is the load hook. */
export const DESIGN_DOCUMENT_SCHEMA_VERSION = 1;

export type DesignDocument = {
  schemaVersion: 1;
  canvas: Canvas;
  /** A Template is a Design Document with Variables declared; a design has none. */
  variables?: VariableDecl[];
  /** Paint order: the first element is at the bottom. */
  elements: Element[];
};

export type Canvas = {
  width: number;
  height: number;
  background: Fill | VarRef;
};

/** `#RRGGBB` or `#RRGGBBAA`. */
export type Color = string;

/** Binds a property to a Variable by name. */
export type VarRef = { $var: string };

/** `offset` runs 0..1. */
export type GradientStop = { offset: number; color: Color };

/** `angle` is in degrees: 0 runs left→right, and angles increase clockwise. */
export type LinearGradient = { type: "linear"; angle: number; stops: GradientStop[] };

/** Centered in the element's bounding box. */
export type RadialGradient = { type: "radial"; stops: GradientStop[] };

export type Fill = Color | LinearGradient | RadialGradient;

export type Shadow = { dx: number; dy: number; blur: number; color: Color; opacity: number };

/** Stroke centered on the edge — half inside, half outside. */
export type Border = { color: Color | VarRef; width: number };

export type CornerRadius =
  | number
  | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };

export type ElementBase = {
  /** Unique across the whole document, groups included. */
  id: string;
  /** Editor layer list only. */
  name?: string;
  /** Px, floats allowed; origin top-left, y down. */
  x: number;
  y: number;
  /** Degrees, clockwise, about the element center. */
  rotation: number;
  /** 0..1. */
  opacity: number;
  /** Boolean Variables bind here. */
  visible: boolean | VarRef;
};

export type RectElement = ElementBase & {
  type: "rect";
  width: number;
  height: number;
  fill: Fill | VarRef;
  cornerRadius?: CornerRadius;
  border?: Border;
  shadow?: Shadow;
};

export type EllipseElement = ElementBase & {
  type: "ellipse";
  width: number;
  height: number;
  fill: Fill | VarRef;
  border?: Border;
  shadow?: Shadow;
};

export type VectorElement = ElementBase & {
  type: "vector";
  width: number;
  height: number;
  /** One SVG path (`d`), in local coordinates. */
  path: string;
  /** Natural bounds of `path`; the compiler scales it to width×height. */
  viewBox: { width: number; height: number };
  fill: Fill | VarRef;
  border?: Border;
  shadow?: Shadow;
};

export type ImageContent = { offsetX: number; offsetY: number; scale: number };

export type ImageElement = ElementBase & {
  type: "image";
  /** The frame; content outside it is clipped. */
  width: number;
  height: number;
  /** An Image Asset id. */
  src: string | VarRef;
  /** Intrinsic px of the authored asset. */
  naturalWidth: number;
  naturalHeight: number;
  /** The authored crop of the placeholder image. `resolve` drops it from an
   *  element whose `src` came from a Variable, and the compiler then places
   *  that image by `fitMode` instead. */
  content?: ImageContent;
  /** Places a Variable-supplied image in the frame. */
  fitMode: "cover" | "contain" | "stretch";
  clip: "none" | "ellipse" | { path: string };
  cornerRadius?: CornerRadius;
  border?: Border;
  shadow?: Shadow;
};

export type TextElement = ElementBase & {
  type: "text";
  /** Wrap width; height is computed from the content. */
  width: number;
  /** May hold `{{name}}` interpolation tokens. */
  content: string;
  /** One Font Asset per element; no rich spans. */
  fontAssetId: string;
  /** Px. */
  fontSize: number;
  /** Unitless multiplier of `fontSize`. */
  lineHeight: number;
  /** Px. */
  letterSpacing: number;
  align: "left" | "center" | "right";
  /** Vertical growth anchor. */
  anchor: "top" | "middle" | "bottom";
  color: Color | VarRef;
  shadow?: Shadow;
};

export type GroupElement = ElementBase & {
  type: "group";
  /** Child coordinates are relative to the group origin; groups nest. A group
   *  has no width or height — its bounds derive from its children. */
  children: Element[];
};

export type Element =
  | RectElement
  | EllipseElement
  | VectorElement
  | ImageElement
  | TextElement
  | GroupElement;

export type VariableType = "text" | "image" | "color" | "number" | "boolean";

export type VariableDecl = {
  /** Unique in the document; referenced by a VarRef and by `{{name}}` tokens. */
  name: string;
  type: VariableType;
  /** Typed per `type`. Absent means callers must supply a value. */
  default?: string | number | boolean;
  /** Text Variables only, in v1. */
  constraints?: { maxLength?: number; minLength?: number };
};
