// The image's environment check: run it inside the pinned image and it says
// whether the environment a render is about to happen in is the one the
// committed tuple describes.
//
//   pnpm --filter worker run image:check
//
// A golden baseline (issue 6bqdxe) is worth nothing without this: the tuple is
// a claim about the image, and these are the observations that hold it to it.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

import { bundledFontPath, bundledFonts } from "@media-canvas/fonts";
import { chromium } from "playwright-core";

import type { BrowserBuild } from "../environment.ts";
import { contextOptions, launchOptions, renderEnvironment } from "../environment.ts";
import { blankDocument, screenshot, textDocument } from "./fixture.ts";

const require = createRequire(import.meta.url);

/** The binary a channel actually spawns, and the version it reports. Nothing
 *  short of the running process says which of the two builds in this image a
 *  channel reaches. */
async function launched(build: BrowserBuild): Promise<{ executable: string; version: string }> {
  const server = await chromium.launchServer(launchOptions(build));
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    const version = browser.version();
    await browser.close();
    return { executable: server.process().spawnfile, version };
  } finally {
    await server.close();
  }
}

void test("the pinned Playwright package is the installed one", () => {
  const installed = require("playwright-core/package.json") as { version: string };
  assert.equal(installed.version, renderEnvironment.playwright);
});

void test("the render path launches full Chromium, not the headless shell", async () => {
  const build = renderEnvironment.browsers.render;
  const { executable, version } = await launched(build);
  assert.match(executable, new RegExp(`/chromium-${build.revision}/`));
  assert.doesNotMatch(executable, /headless[_-]shell/);
  assert.equal(version, build.version);
});

void test("the paired headless shell is here for the parity fixture to launch", async () => {
  const build = renderEnvironment.browsers.parity;
  const { executable, version } = await launched(build);
  assert.match(executable, new RegExp(`/chromium_headless_shell-${build.revision}/`));
  assert.equal(version, build.version);
});

void test("the fonts the image can draw with are the bundled set and nothing else", () => {
  const listed = execFileSync("fc-list", ["--format", "%{file}\n"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "")
    .sort();
  assert.deepEqual(listed, bundledFonts.map(bundledFontPath).sort());
  assert.equal(listed.length, renderEnvironment.fonts.files);
  for (const directory of ["/usr/share/fonts", "/usr/local/share/fonts"]) {
    assert.equal(existsSync(directory), false, `${directory} still holds faces nobody pinned`);
  }
});

void test("the font configuration is the committed one, with no cascade behind it", () => {
  const configuration = createHash("sha256");
  configuration.update("fonts.conf");
  configuration.update("\0");
  configuration.update(readFileSync("/etc/fonts/fonts.conf"));
  configuration.update("\0");
  assert.equal(configuration.digest("hex"), renderEnvironment.fonts.configuration);
  assert.equal(existsSync("/etc/fonts/conf.d"), false);
});

void test("a glyph no bundled font carries draws the Font Asset's own .notdef", async () => {
  const browser = await chromium.launch(launchOptions(renderEnvironment.browsers.render));
  try {
    const page = await (await browser.newContext(contextOptions())).newPage();
    // Han characters, which no bundled family has a glyph for. Two families
    // draw two different boxes and a third draws nothing at all — Pacifico's
    // own .notdef is a blank advance (packages/fonts/README.md) — so what
    // lands on the canvas is the face the markup carries, and not one face
    // the image substituted for all three.
    const inter = await screenshot(page, textDocument("漢字"));
    const lora = await screenshot(page, textDocument("漢字", "Lora"));
    const pacifico = await screenshot(page, textDocument("漢字", "Pacifico"));
    const blank = await screenshot(page, blankDocument());
    assert.notDeepEqual(inter, blank);
    assert.notDeepEqual(lora, inter);
    assert.deepEqual(pacifico, blank);
  } finally {
    await browser.close();
  }
});

void test("the page takes its settings from the image, not from the host", async () => {
  const host = { TZ: process.env.TZ, LANG: process.env.LANG };
  process.env.TZ = "America/New_York";
  process.env.LANG = "de_DE.UTF-8";
  const browser = await chromium.launch(launchOptions(renderEnvironment.browsers.render));
  try {
    const page = await (await browser.newContext(contextOptions())).newPage();
    await page.setContent("<!doctype html>");
    const { page: pinned } = renderEnvironment;
    assert.deepEqual(
      await page.evaluate(() => ({
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceScaleFactor: window.devicePixelRatio,
        colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })),
      {
        locale: pinned.locale,
        timezone: pinned.timezone,
        deviceScaleFactor: pinned.deviceScaleFactor,
        colorScheme: pinned.colorScheme,
        viewport: pinned.viewport,
      },
    );
  } finally {
    await browser.close();
    Object.assign(process.env, host);
  }
});
