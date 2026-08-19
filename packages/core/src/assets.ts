// The compiler's read contract for assets. The core stays tenancy-blind: a
// resolver hands over bytes, a URL, and a size for ids the document already
// carries, and workspace scoping is enforced at the api's routes (ADR-0009).

import type { DesignDocument, Element } from "./document.ts";

export interface AssetResolver {
  /** The Font Asset's bytes, which the compiler parses for text metrics and
   *  inlines into the compiled markup as an `@font-face` source. */
  fontBytes(fontAssetId: string): ArrayBuffer;
  /** The immutable app-storage URL for an Image Asset id, or an external
   *  `http(s)` URL passed through. */
  imageUrl(src: string): string;
  /** The intrinsic size of an image, for placing a Variable-supplied one. */
  imageSize(src: string): { width: number; height: number };
}

/** The assets one document draws with, each named once, in the order the
 *  document reaches them. */
export type ReferencedAssets = { fonts: string[]; images: string[] };

/**
 * Which Font and Image Assets a document references.
 *
 * The compiler asks for font bytes and image sizes as it draws, and answers
 * synchronously, so whatever fetches assets over a network has to know what to
 * take before the first compile — this says it, without compiling anything. A
 * `src` still bound to a Variable names no asset: what it resolves to is
 * decided before a compile, not by the document.
 */
export function referencedAssets(document: DesignDocument): ReferencedAssets {
  const fonts = new Set<string>();
  const images = new Set<string>();
  const walk = (elements: readonly Element[]): void => {
    for (const element of elements) {
      if (element.type === "text") fonts.add(element.fontAssetId);
      else if (element.type === "image" && typeof element.src === "string") images.add(element.src);
      else if (element.type === "group") walk(element.children);
    }
  };
  walk(document.elements);
  return { fonts: [...fonts], images: [...images] };
}
