// The shared core (ADR-0003): Design Document schema types, validation,
// value substitution, and the JSON→SVG compiler. Used by the editor and the
// render worker; nothing else interprets document internals.

export * from "./document.ts";
export { interpolationTokens, validateDocument } from "./validation.ts";
export type { ValidationError } from "./validation.ts";
