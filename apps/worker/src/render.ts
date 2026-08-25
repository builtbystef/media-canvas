// The last step of the pipeline (issue zycblh, ADR-0002): compiled markup in,
// one file out. The page is the canvas and nothing else; PNG keeps the
// canvas's alpha, JPEG sits on white, and PDF is the browser's own print,
// with text still text.

import { chromium, type Page } from "playwright-core";

import type { BrowserBuild } from "./environment.ts";
import { contextOptions, launchOptions, renderEnvironment } from "./environment.ts";

export type RenderOptions =
  | { format: "png"; scale: 1 | 2 | 3 }
  | { format: "jpeg"; quality?: number }
  | { format: "pdf" };

/** The canvas the markup describes: its width and height in CSS pixels, taken
 *  from the root SVG. Without those the page has no size, and there is nothing
 *  to print. */
type CanvasSize = { width: number; height: number };

const DEFAULT_JPEG_QUALITY = 90;
const CSS_PX_PER_INCH = 96;

/** Turn compiled markup into the bytes of exactly one file. */
export async function render(svg: string, options: RenderOptions): Promise<Uint8Array> {
  return renderWith(renderEnvironment.browsers.render, svg, options);
}

/** Same as `render`, against one of the image's two browser builds. The
 *  production path never calls this with the headless shell; the named
 *  cross-flavor parity fixture (issue 6bqdxe) is the only caller. */
export async function renderWith(
  build: BrowserBuild,
  svg: string,
  options: RenderOptions,
): Promise<Uint8Array> {
  const size = canvasSize(svg);
  if (size === undefined) {
    throw new Error("markup will not load: the SVG has no canvas size");
  }

  const browser = await chromium.launch(launchOptions(build));
  try {
    const scale = options.format === "png" ? options.scale : 1;
    const context = await browser.newContext({
      ...contextOptions(),
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    return await renderOnPage(page, svg, options);
  } finally {
    await browser.close();
  }
}

/** Capture one file from a page that is already the right size and scale.
 *  The page pool reuses pages across calls; `render` / `renderWith` create a
 *  page, call this, and close it. */
export async function renderOnPage(
  page: Page,
  svg: string,
  options: RenderOptions,
): Promise<Uint8Array> {
  const size = canvasSize(svg);
  if (size === undefined) {
    throw new Error("markup will not load: the SVG has no canvas size");
  }
  await page.setViewportSize({ width: size.width, height: size.height });
  const images = trackImages(page);
  try {
    try {
      await page.setContent(pageMarkup(svg, size, options.format));
    } catch (failure) {
      throw new Error(`markup will not load: ${cause(failure)}`, { cause: failure });
    }

    await images.idle();
    if (images.failed.length > 0) {
      throw new Error(`image the page cannot fetch: ${images.failed[0]}`);
    }

    await page.evaluate(() => document.fonts.ready);

    if (options.format === "pdf") {
      const widthIn = size.width / CSS_PX_PER_INCH;
      const heightIn = size.height / CSS_PX_PER_INCH;
      const bytes = await page.pdf({
        width: `${String(widthIn)}in`,
        height: `${String(heightIn)}in`,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: false,
      });
      return new Uint8Array(bytes);
    }

    if (options.format === "jpeg") {
      const bytes = await page.screenshot({
        type: "jpeg",
        quality: options.quality ?? DEFAULT_JPEG_QUALITY,
        omitBackground: false,
        animations: "disabled",
      });
      return new Uint8Array(bytes);
    }

    const bytes = await page.screenshot({
      type: "png",
      omitBackground: true,
      animations: "disabled",
    });
    return new Uint8Array(bytes);
  } finally {
    images.stop();
  }
}

/** The root SVG's width and height, unitless or in `px`. Anything else is not
 *  a canvas size this function can print. */
function canvasSize(svg: string): CanvasSize | undefined {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (open === null) return undefined;
  const width = dimension(open[0], "width");
  const height = dimension(open[0], "height");
  if (width === undefined || height === undefined) return undefined;
  return { width, height };
}

function dimension(tag: string, name: string): number | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  if (match === null) return undefined;
  const raw = match[1]?.trim();
  if (raw === undefined) return undefined;
  const value = raw.endsWith("px") ? raw.slice(0, -2).trim() : raw;
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return undefined;
  return size;
}

/** Watch image requests so a dead URL fails the render instead of becoming a
 *  hole in the picture. Self-contained markup never starts one, so this is
 *  idle on the production path and only the synthetic dead-URL check pays. */
function trackImages(page: Page): {
  failed: string[];
  idle: () => Promise<void>;
  stop: () => void;
} {
  const failed: string[] = [];
  const pending = new Set<object>();
  let release: (() => void) | undefined;
  let settled = Promise.resolve();

  const begin = (request: object) => {
    if (pending.has(request)) return;
    if (pending.size === 0) {
      settled = new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    pending.add(request);
  };
  const end = (request: object) => {
    if (!pending.delete(request)) return;
    if (pending.size === 0) release?.();
  };

  const onRequest = (request: { resourceType: () => string }) => {
    if (request.resourceType() === "image") begin(request);
  };
  const onFailed = (request: { resourceType: () => string; url: () => string }) => {
    if (request.resourceType() === "image") {
      failed.push(request.url());
      end(request);
    }
  };
  const onFinished = (request: {
    resourceType: () => string;
    url: () => string;
    response: () => Promise<{ ok: () => boolean; url: () => string } | null>;
  }) => {
    if (request.resourceType() !== "image") return;
    void request.response().then(
      (response) => {
        if (response !== null && !response.ok()) failed.push(response.url());
        end(request);
      },
      () => {
        failed.push(request.url());
        end(request);
      },
    );
  };
  page.on("request", onRequest);
  page.on("requestfailed", onFailed);
  page.on("requestfinished", onFinished);

  return {
    failed,
    idle: () => settled,
    stop: () => {
      page.off("request", onRequest);
      page.off("requestfailed", onFailed);
      page.off("requestfinished", onFinished);
    },
  };
}

function pageMarkup(svg: string, size: CanvasSize, format: RenderOptions["format"]): string {
  const background = format === "jpeg" ? "white" : "transparent";
  const width = String(size.width);
  const height = String(size.height);
  return [
    "<!doctype html>",
    "<style>",
    `html,body{margin:0;padding:0;width:${width}px;height:${height}px;background:${background};overflow:hidden}`,
    "svg{display:block}",
    `@page{size:${width}px ${height}px;margin:0}`,
    "</style>",
    svg,
  ].join("");
}

function cause(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
