export const DESIGN_DOCUMENT_SCHEMA_VERSION = 1;

export type DesignDocument = {
  schemaVersion: 1;
  canvas: Canvas;
  variables?: VariableDecl[];
  elements: Element[];
};

export type Canvas = {
  width: number;
  height: number;
  background: Fill | VarRef;
};

export type Color = string;

export type VarRef = { $var: string };

export type GradientStop = { offset: number; color: Color };

export type LinearGradient = { type: "linear"; angle: number; stops: GradientStop[] };

export type RadialGradient = { type: "radial"; stops: GradientStop[] };

export type Fill = Color | LinearGradient | RadialGradient;

export type Shadow = { dx: number; dy: number; blur: number; color: Color; opacity: number };

export type Border = { color: Color | VarRef; width: number };

export type CornerRadius =
  | number
  | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };

export type ElementBase = {
  id: string;
  name?: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
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
  path: string;
  viewBox: { width: number; height: number };
  fill: Fill | VarRef;
  border?: Border;
  shadow?: Shadow;
};

export type ImageContent = { offsetX: number; offsetY: number; scale: number };

export type ImageElement = ElementBase & {
  type: "image";
  width: number;
  height: number;
  src: string | VarRef;
  naturalWidth: number;
  naturalHeight: number;
  content?: ImageContent;
  fitMode: "cover" | "contain" | "stretch";
  clip: "none" | "ellipse" | { path: string };
  cornerRadius?: CornerRadius;
  border?: Border;
  shadow?: Shadow;
};

export type TextElement = ElementBase & {
  type: "text";
  width: number;
  content: string;
  fontAssetId: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  align: "left" | "center" | "right";
  anchor: "top" | "middle" | "bottom";
  color: Color | VarRef;
  shadow?: Shadow;
};

export type GroupElement = ElementBase & {
  type: "group";
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
  name: string;
  type: VariableType;
  default?: string | number | boolean;
  constraints?: { maxLength?: number; minLength?: number };
};
