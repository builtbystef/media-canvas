import { listFonts, listImages } from "@media-canvas/api-client";
import type { AssetResolver, DesignDocument } from "@media-canvas/core";
import { referencedAssets } from "@media-canvas/core";

/** The assets the compiled preview will ask for: authored references plus
 *  Image Variable defaults that resolve will paint. */
function previewReferencedAssets(document: DesignDocument) {
  const wanted = referencedAssets(document);
  const defaults = (document.variables ?? []).flatMap((variable) =>
    variable.type === "image" && typeof variable.default === "string" ? [variable.default] : [],
  );
  return defaults.length === 0
    ? wanted
    : { ...wanted, images: [...new Set([...wanted.images, ...defaults])] };
}

/**
 * The assets a document is compiled with, held in the browser.
 *
 * The compiler asks for font bytes and image sizes while it draws, and answers
 * synchronously (ADR-0006), so everything a document references is fetched
 * before the first compile and kept for every compile after it. Font bytes are
 * the compiler's own: it parses them for metrics and inlines them into the
 * markup, so the editor injects no font rules of its own.
 */
export type AssetLibrary = {
  fonts: Map<string, ArrayBuffer>;
  images: Map<string, { url: string; width: number; height: number }>;
};

/** The resolver the core compiles through, over assets already in hand. */
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

/** The assets the document references that the library cannot answer for — a
 *  deleted asset, or one belonging to another Workspace. There is no partial
 *  compile: without every one of them, nothing is drawn (issue ljzbq7). */
export function missingAssets(document: DesignDocument, library: AssetLibrary): string[] {
  const wanted = previewReferencedAssets(document);
  return [
    ...wanted.fonts.filter((fontAssetId) => !library.fonts.has(fontAssetId)),
    ...wanted.images.filter((src) => !library.images.has(src)),
  ];
}

/**
 * Fetch what the document draws with, plus any fonts an editor operation is
 * about to introduce, from the Workspace that holds it.
 *
 * The two list endpoints say what the Workspace has and where each asset is
 * served from; only the fonts requested here are then pulled down, since a face
 * is hundreds of kilobytes and a Workspace may hold many. Anything that cannot
 * be fetched is simply absent from the library, and the caller can refuse a
 * half-drawn canvas while naming what is missing.
 */
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
