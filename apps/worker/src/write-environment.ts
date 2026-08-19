// Rewrites the committed environment tuple:
//
//   pnpm --filter worker run environment:write
//
// Most of the tuple is a fact about the repository — the base image the
// Dockerfile pins, the Playwright package and the browser builds paired with
// it, the bundled font set, the font configuration, the compiler — so it is
// read here rather than typed by hand, and `environment.test.ts` fails when
// the committed file and the repository have drifted apart. The page settings
// below are the exception: they are chosen, and changing one is a deliberate
// change of environment that re-bakes every golden baseline.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "@media-canvas/core";
import { bundledFonts } from "@media-canvas/fonts";

import type { BrowserBuild, RenderEnvironment } from "./environment.ts";
import { environmentFile } from "./environment.ts";

/** The page every render starts from. The viewport is the largest Canvas
 *  Preset, so an ordinary render narrows the page rather than growing it; the
 *  device scale factor is 1 because a PNG's scale is a render option, not a
 *  property of the environment; and locale, timezone and color scheme are
 *  fixed so that a date, a numeral or a media query cannot come out differently
 *  on another host. */
const page = {
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezone: "UTC",
  colorScheme: "light",
} as const;

const workerRoot = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

/** SHA-256 over a list of named byte strings, the name included so that moving
 *  content between files changes the digest. */
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

/** The base image, as the Dockerfile pins it: a name and a digest. */
function baseImage(dockerfile: string): string {
  const [, base] = /^FROM\s+(\S+)/m.exec(dockerfile) ?? [];
  if (base === undefined) throw new Error("the Dockerfile has no FROM line");
  return base;
}

/** The browser build the pinned Playwright pairs with itself, for one channel.
 *  A channel is Playwright's name for a flavor; the revision is the build.
 *  `browsers.json` is the package's own record of that pairing — the same file
 *  its installer reads — and it is not on the package's exports, so it is read
 *  from beside the manifest. */
function browserBuild(channel: BrowserBuild["channel"], flavor: string): BrowserBuild {
  const packageRoot = dirname(require.resolve("playwright-core/package.json"));
  const registry = JSON.parse(readFileSync(join(packageRoot, "browsers.json"), "utf8")) as {
    browsers: { name: string; revision: string; browserVersion: string }[];
  };
  const build = registry.browsers.find((candidate) => candidate.name === channel);
  if (!build) throw new Error(`the pinned Playwright knows no browser "${channel}"`);
  return { channel, flavor, revision: build.revision, version: build.browserVersion };
}

/** The compiler's sources, tests excluded: a test cannot move a pixel. */
function compilerSources(): { name: string; bytes: Buffer }[] {
  const source = dirname(fileURLToPath(import.meta.resolve("@media-canvas/core")));
  return readdirSync(source)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, bytes: readFileSync(join(source, name)) }));
}

/** The tuple the repository currently describes. */
export function computeEnvironment(): RenderEnvironment {
  // The recipe is everything that turns the base image into this one; the
  // workspace sources it copies in are pinned by the fields below.
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

// Importing this module (the test does) reads the repository; running it
// writes the file.
if (import.meta.main) {
  writeFileSync(environmentFile, `${JSON.stringify(computeEnvironment(), undefined, 2)}\n`);
}
