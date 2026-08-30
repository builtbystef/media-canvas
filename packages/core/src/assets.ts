import type { DesignDocument, Element } from "./document.ts";

export interface AssetResolver {
  fontBytes(fontAssetId: string): ArrayBuffer;
  imageUrl(src: string): string;
  imageSize(src: string): { width: number; height: number };
}

export type ReferencedAssets = { fonts: string[]; images: string[] };

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
