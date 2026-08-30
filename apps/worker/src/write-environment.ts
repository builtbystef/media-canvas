import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "@media-canvas/core";
import { bundledFonts } from "@media-canvas/fonts";

import type { BrowserBuild, RenderEnvironment } from "./environment.ts";
import { environmentFile } from "./environment.ts";

const page = {
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezone: "UTC",
  colorScheme: "light",
} as const;

const workerRoot = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function digest(entries: { name: string; bytes: Buffer | string }[]): string {
  const hash = createHash("sha256");
  for (const { name, bytes } of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(name);
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function baseImage(dockerfile: string): string {
  const [, base] = /^FROM\s+(\S+)/m.exec(dockerfile) ?? [];
  if (base === undefined) throw new Error("the Dockerfile has no FROM line");
  return base;
}

function browserBuild(channel: BrowserBuild["channel"], flavor: string): BrowserBuild {
  const packageRoot = dirname(require.resolve("playwright-core/package.json"));
  const registry = JSON.parse(readFileSync(join(packageRoot, "browsers.json"), "utf8")) as {
    browsers: { name: string; revision: string; browserVersion: string }[];
  };
  const build = registry.browsers.find((candidate) => candidate.name === channel);
  if (!build) throw new Error(`the pinned Playwright knows no browser "${channel}"`);
  return { channel, flavor, revision: build.revision, version: build.browserVersion };
}

function compilerSources(): { name: string; bytes: Buffer }[] {
  const source = dirname(fileURLToPath(import.meta.resolve("@media-canvas/core")));
  return readdirSync(source)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, bytes: readFileSync(join(source, name)) }));
}

export function computeEnvironment(): RenderEnvironment {
  const recipe = ["Dockerfile", "Dockerfile.dockerignore", "fonts.conf"].map((name) => ({
    name,
    bytes: readFileSync(join(workerRoot, name)),
  }));
  return {
    image: {
      base: baseImage(readFileSync(join(workerRoot, "Dockerfile"), "utf8")),
      recipe: digest(recipe),
    },
    playwright: (require("playwright-core/package.json") as { version: string }).version,
    browsers: {
      render: browserBuild("chromium", "full Chromium, new headless"),
      parity: browserBuild("chromium-headless-shell", "chrome-headless-shell"),
    },
    fonts: {
      set: digest(bundledFonts.map((font) => ({ name: font.file, bytes: font.id }))),
      files: bundledFonts.length,
      configuration: digest([
        { name: "fonts.conf", bytes: readFileSync(join(workerRoot, "fonts.conf")) },
      ]),
    },
    page: { ...page, viewport: { ...page.viewport } },
    compiler: digest(compilerSources()),
    schemaVersion: DESIGN_DOCUMENT_SCHEMA_VERSION,
  };
}

if (import.meta.main) {
  writeFileSync(environmentFile, `${JSON.stringify(computeEnvironment(), undefined, 2)}\n`);
}
