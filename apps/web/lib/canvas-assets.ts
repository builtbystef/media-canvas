import { listFonts, listImages } from "@media-canvas/api-client";
import type { AssetResolver, DesignDocument } from "@media-canvas/core";
import { referencedAssets } from "@media-canvas/core";

function previewReferencedAssets(document: DesignDocument) {
  const wanted = referencedAssets(document);
  const defaults = (document.variables ?? []).flatMap((variable) =>
    variable.type === "image" && typeof variable.default === "string" ? [variable.default] : [],
  );
  return defaults.length === 0
    ? wanted
    : { ...wanted, images: [...new Set([...wanted.images, ...defaults])] };
}

export type AssetLibrary = {
  fonts: Map<string, ArrayBuffer>;
  images: Map<string, { url: string; width: number; height: number }>;
};

export function resolverFor(library: AssetLibrary): AssetResolver {
  return {
    fontBytes(fontAssetId) {
      const bytes = library.fonts.get(fontAssetId);
      if (!bytes) throw new Error(`the Font Asset "${fontAssetId}" was not fetched`);
      return bytes;
    },
    imageUrl(src) {
      const image = library.images.get(src);
      if (!image) throw new Error(`the Image Asset "${src}" was not fetched`);
      return image.url;
    },
    imageSize(src) {
      const image = library.images.get(src);
      if (!image) throw new Error(`the Image Asset "${src}" was not fetched`);
      return { width: image.width, height: image.height };
    },
  };
}

export function missingAssets(document: DesignDocument, library: AssetLibrary): string[] {
  const wanted = previewReferencedAssets(document);
  return [
    ...wanted.fonts.filter((fontAssetId) => !library.fonts.has(fontAssetId)),
    ...wanted.images.filter((src) => !library.images.has(src)),
  ];
}

export async function loadAssets(
  workspaceId: string,
  document: DesignDocument,
  additionalFonts: readonly string[] = [],
): Promise<AssetLibrary> {
  const wanted = previewReferencedAssets(document);
  const wantedFonts = [...new Set([...wanted.fonts, ...additionalFonts])];
  const [fonts, images] = await Promise.all([
    wantedFonts.length === 0 ? undefined : listFonts({ path: { workspaceId } }),
    wanted.images.length === 0 ? undefined : listImages({ path: { workspaceId } }),
  ]);
  const held: AssetLibrary = { fonts: new Map(), images: new Map() };
  for (const image of images?.data ?? []) {
    if (wanted.images.includes(image.id)) {
      held.images.set(image.id, { url: image.url, width: image.width, height: image.height });
    }
  }
  await Promise.all(
    (fonts?.data ?? [])
      .filter((font) => wantedFonts.includes(font.id))
      .map(async (font) => {
        const response = await fetch(font.url);
        if (!response.ok) return;
        held.fonts.set(font.id, await response.arrayBuffer());
      }),
  );
  return held;
}
