// The shared core (ADR-0003): Design Document schema types, validation,
// value substitution, and the JSON→SVG compiler. Used by the editor and the
// render worker; nothing else interprets document internals.

export * from "./document.ts";
export type { AssetResolver, ReferencedAssets } from "./assets.ts";
export { referencedAssets } from "./assets.ts";
export type { ElementPatch, Preview, PreviewUpdate } from "./preview.ts";
export type { FontFacts, FontFormat, FontInspection, FontProblem } from "./fonts.ts";
export type { ResolveMode } from "./values.ts";
export type { ValidationError } from "./validation.ts";
export { compile } from "./compile.ts";
export { createPreview } from "./preview.ts";
export { inspectFont } from "./fonts.ts";
export { interpolationTokens, validateDocument } from "./validation.ts";
export { resolve, typeCells, validate } from "./values.ts";
