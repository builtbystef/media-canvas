// One Template plus one row of values, to file bytes. Validation refuses
// before a browser is touched; assets are loaded and inlined so the render
// page never reaches the network.

import type { AssetResolver, DesignDocument, ValidationError } from "@media-canvas/core";
import { compile, referencedAssets, resolve, validate } from "@media-canvas/core";

import { AssetFetchError, loadAssetResolver } from "./asset-source.ts";
import type { PagePool } from "./page-pool.ts";
import type { RenderOptions } from "./render.ts";

export { AssetFetchError } from "./asset-source.ts";

/** A row of values the Template will not accept. The render opened no page. */
export class ValueRefusal extends Error {
  readonly errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super(errors[0]?.message ?? "the values are not valid for this Template");
    this.errors = errors;
  }
}

/** What one render needs besides the document: the pool it draws in, and
 *  where to read held asset bytes. */
export type RenderDocumentOptions = {
  workspaceId: string;
  template: DesignDocument;
  values: Record<string, unknown>;
  output: RenderOptions;
  pool: PagePool;
  /** Origin of the api, used to GET /internal/workspaces/.../assets/... */
  apiBaseUrl?: string;
  token?: string;
};

/**
 * Validate, resolve, compile, and render. Value problems throw ValueRefusal
 * before the pool is touched; missing assets throw AssetFetchError before
 * the pool is touched.
 */
export async function renderDocument(options: RenderDocumentOptions): Promise<Uint8Array> {
  const errors = renderErrors(options.template, options.values);
  if (errors.length > 0) throw new ValueRefusal(errors);

  const document = resolve(options.template, options.values);
  const referenced = referencedAssets(document);
  const needsAssets = referenced.fonts.length > 0 || referenced.images.length > 0;
  if (needsAssets && (options.apiBaseUrl === undefined || options.token === undefined)) {
    throw new AssetFetchError(
      referenced.fonts[0] ?? referenced.images[0] ?? "",
      "the worker has no api origin to fetch assets from",
    );
  }
  const assets =
    needsAssets && options.apiBaseUrl !== undefined && options.token !== undefined
      ? await loadAssetResolver({
          workspaceId: options.workspaceId,
          apiBaseUrl: options.apiBaseUrl,
          token: options.token,
          fonts: referenced.fonts,
          images: referenced.images,
        })
      : refusingAssets();
  const svg = compile(document, assets);
  return options.pool.render(svg, options.output);
}

/** Value problems that refuse a render before a page is opened: the Template's
 *  own `validate` errors, and a value naming a Variable the Template does not
 *  declare. */
export function renderErrors(
  template: DesignDocument,
  values: Record<string, unknown>,
): ValidationError[] {
  const declared = new Set((template.variables ?? []).map((variable) => variable.name));
  const unknown = Object.keys(values)
    .filter((name) => !declared.has(name))
    .map((name) => ({
      variable: name,
      message: `the Variable "${name}" is not declared`,
    }));
  return [...unknown, ...validate(template, values)];
}

function refusingAssets(): AssetResolver {
  return {
    fontBytes() {
      throw new Error("no Font Asset expected");
    },
    imageUrl() {
      throw new Error("no Image Asset expected");
    },
    imageSize() {
      throw new Error("no Image Asset expected");
    },
  };
}
