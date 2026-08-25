// The worker's read of assets: held bytes from the api's internal route, and
// external image URLs fetched here so the render page never reaches the
// network. The compiler then sees only data URIs.

import type { AssetResolver } from "@media-canvas/core";

import { imageSize } from "./image-size.ts";

/** An asset the worker could not load. Distinguishable from a value refusal
 *  because a later retry of bad values would fail identically, and a later
 *  retry of a fetch might not. */
export class AssetFetchError extends Error {
  readonly assetId: string;
  constructor(assetId: string, message: string) {
    super(message);
    this.assetId = assetId;
  }
}

const FETCH_TIMEOUT_MS = 15_000;

export type AssetSourceOptions = {
  workspaceId: string;
  apiBaseUrl: string;
  token: string;
  fonts: readonly string[];
  images: readonly string[];
};

/** Fetch every Font and Image Asset a resolved document names, and hand the
 *  compiler a resolver that answers from those bytes. */
export async function loadAssetResolver(options: AssetSourceOptions): Promise<AssetResolver> {
  const fonts = new Map<string, ArrayBuffer>();
  const images = new Map<string, { url: string; size: { width: number; height: number } }>();

  await Promise.all([
    ...options.fonts.map(async (fontAssetId) => {
      const { bytes } = await fetchHeld(options, fontAssetId);
      fonts.set(fontAssetId, bytesToBuffer(bytes));
    }),
    ...options.images.map(async (src) => {
      const { bytes, type } = isExternalUrl(src)
        ? await fetchExternal(src)
        : await fetchHeld(options, src);
      const size = imageSize(bytes);
      if (size === undefined) {
        throw new AssetFetchError(src, `the asset "${src}" is not a PNG, JPEG, or WebP image`);
      }
      images.set(src, { url: dataUri(bytes, type), size });
    }),
  ]);

  return {
    fontBytes(fontAssetId) {
      const bytes = fonts.get(fontAssetId);
      if (bytes === undefined) throw new Error(`no bytes for the Font Asset "${fontAssetId}"`);
      return bytes;
    },
    imageUrl(src) {
      const loaded = images.get(src);
      if (loaded === undefined) throw new Error(`no bytes for the Image Asset "${src}"`);
      return loaded.url;
    },
    imageSize(src) {
      const loaded = images.get(src);
      if (loaded === undefined) throw new Error(`no bytes for the Image Asset "${src}"`);
      return loaded.size;
    },
  };
}

function isExternalUrl(src: string): boolean {
  return /^https?:\/\//.test(src);
}

async function fetchHeld(
  options: AssetSourceOptions,
  assetId: string,
): Promise<{ bytes: Uint8Array; type: string }> {
  const origin = options.apiBaseUrl.replace(/\/$/, "");
  const url = `${origin}/internal/workspaces/${options.workspaceId}/assets/${assetId}`;
  return fetchBytes(url, assetId, { authorization: `Bearer ${options.token}` });
}

async function fetchExternal(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  return fetchBytes(url, url);
}

async function fetchBytes(
  url: string,
  assetId: string,
  headers?: Record<string, string>,
): Promise<{ bytes: Uint8Array; type: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...(headers === undefined ? {} : { headers }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (failure) {
    throw new AssetFetchError(assetId, `could not fetch the asset "${assetId}": ${cause(failure)}`);
  }
  if (response.status === 404) {
    throw new AssetFetchError(assetId, `the asset "${assetId}" was not found`);
  }
  if (!response.ok) {
    throw new AssetFetchError(
      assetId,
      `could not fetch the asset "${assetId}": HTTP ${String(response.status)}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "application/octet-stream";
  return { bytes, type };
}

function dataUri(bytes: Uint8Array, type: string): string {
  const mime = type.split(";")[0]?.trim() || "application/octet-stream";
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function cause(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
