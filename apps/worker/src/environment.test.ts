import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "@media-canvas/core";
import { bundledFonts } from "@media-canvas/fonts";
import { expect, test } from "vitest";

import { contextOptions, launchOptions, renderEnvironment } from "./environment.ts";
import { computeEnvironment } from "./write-environment.ts";

const workerRoot = join(import.meta.dirname, "..");

test("the committed tuple is the environment this repository builds", () => {
  expect(renderEnvironment, "run `pnpm --filter worker run environment:write`").toEqual(
    computeEnvironment(),
  );
});

test("the base image is pinned by digest, not by a tag that can move", () => {
  expect(renderEnvironment.image.base).toMatch(/@sha256:[0-9a-f]{64}$/);
  expect(readFileSync(join(workerRoot, "Dockerfile"), "utf8")).toContain(
    `FROM ${renderEnvironment.image.base}`,
  );
});

test("both browser builds come from the one pinned Playwright pairing", () => {
  const { render, parity } = renderEnvironment.browsers;
  expect(render.revision).toBe(parity.revision);
  expect(render.version).toBe(parity.version);
});

test("the render path launches full Chromium in new headless mode (ADR-0002)", () => {
  const { render, parity } = renderEnvironment.browsers;
  expect(render.channel).toBe("chromium");
  expect(launchOptions(render)).toEqual({ channel: "chromium", headless: true });
  expect(parity.channel).toBe("chromium-headless-shell");
});

test("the font set identity follows the bundled Font Asset ids", () => {
  const identity = createHash("sha256");
  for (const font of [...bundledFonts].sort((a, b) => a.file.localeCompare(b.file))) {
    identity.update(font.file);
    identity.update("\0");
    identity.update(font.id);
    identity.update("\0");
  }
  expect(renderEnvironment.fonts.set).toBe(identity.digest("hex"));
  expect(renderEnvironment.fonts.files).toBe(bundledFonts.length);
});

test("the tuple names the schema version the compiler accepts", () => {
  expect(renderEnvironment.schemaVersion).toBe(DESIGN_DOCUMENT_SCHEMA_VERSION);
});

test("a page starts from the pinned settings rather than from the host", () => {
  const { page } = renderEnvironment;
  expect(contextOptions()).toEqual({
    viewport: page.viewport,
    deviceScaleFactor: page.deviceScaleFactor,
    locale: page.locale,
    timezoneId: page.timezone,
    colorScheme: page.colorScheme,
  });
});
