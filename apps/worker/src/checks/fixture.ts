import type { AssetResolver, DesignDocument } from "@media-canvas/core";
import { compile } from "@media-canvas/core";
import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";
import type { Page } from "playwright-core";

export const bundledAssets: AssetResolver = {
  fontBytes(fontAssetId) {
    const font = bundledFonts.find((candidate) => candidate.id === fontAssetId);
    if (!font) throw new Error(`no bundled Font Asset "${fontAssetId}"`);
    return bundledFontBytes(font);
  },
  imageUrl() {
    throw new Error("the image checks draw no Image Asset");
  },
  imageSize() {
    throw new Error("the image checks draw no Image Asset");
  },
};

function bundled(family: string, weight: number): string {
  const font = bundledFonts.find(
    (candidate) =>
      candidate.family === family && candidate.weight === weight && candidate.style === "normal",
  );
  if (!font) throw new Error(`the bundled set has no ${family} ${weight}`);
  return font.id;
}

export function textDocument(content: string, family = "Inter"): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 320, height: 120, background: "#FFFFFF" },
    elements: [
      {
        id: "text",
        type: "text",
        x: 20,
        y: 20,
        width: 280,
        rotation: 0,
        opacity: 1,
        visible: true,
        content,
        fontAssetId: bundled(family, 400),
        fontSize: 48,
        lineHeight: 1.2,
        letterSpacing: 0,
        align: "left",
        anchor: "top",
        color: "#101828",
      },
    ],
  };
}

export function blankDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 320, height: 120, background: "#FFFFFF" },
    elements: [],
  };
}

export async function screenshot(page: Page, document: DesignDocument): Promise<Buffer> {
  const svg = compile(document, bundledAssets);
  await page.setViewportSize({ width: document.canvas.width, height: document.canvas.height });
  await page.setContent(`<!doctype html><style>html,body{margin:0}</style>${svg}`);
  return page.screenshot({ type: "png" });
}

export function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
