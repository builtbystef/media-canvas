import assert from "node:assert/strict";
import { test } from "node:test";

import type { DesignDocument } from "@media-canvas/core";
import { chromium } from "playwright-core";

import { contextOptions, launchOptions, renderEnvironment } from "../environment.ts";
import { blankDocument, pngSize, screenshot, textDocument } from "./fixture.ts";

async function render(document: DesignDocument): Promise<Buffer> {
  const browser = await chromium.launch(launchOptions(renderEnvironment.browsers.render));
  try {
    const context = await browser.newContext(contextOptions());
    return await screenshot(await context.newPage(), document);
  } finally {
    await browser.close();
  }
}

void test("two runs of one document produce byte-identical output", async () => {
  const document = textDocument("Media Canvas");
  const first = await render(document);
  const second = await render(document);
  assert.deepEqual(second, first);
});

void test("the render is the document, at the canvas size and the pinned scale", async () => {
  const document = textDocument("Media Canvas");
  const png = await render(document);
  const { deviceScaleFactor } = renderEnvironment.page;
  assert.deepEqual(pngSize(png), {
    width: document.canvas.width * deviceScaleFactor,
    height: document.canvas.height * deviceScaleFactor,
  });
  assert.notDeepEqual(png, await render(blankDocument()), "the text drew nothing");
});
