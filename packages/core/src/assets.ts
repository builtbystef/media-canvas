// The compiler's read contract for assets. The core stays tenancy-blind: a
// resolver hands over bytes, a URL, and a size for ids the document already
// carries, and workspace scoping is enforced at the api's routes (ADR-0009).

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
