// The pinned render environment (issue 6sfpv3, ADR-0002).
//
// `environment.json` beside this file is the environment tuple: the record of
// every input that can move a pixel, from the image the render runs in down to
// the page's locale. A golden baseline (issue 6bqdxe) is only meaningful
// against one tuple, so the checks in `checks/` compare the environment they
// are running in against this file, and the render path takes its browser and
// page settings from it rather than from anything the host supplies.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContextOptions, LaunchOptions } from "playwright-core";

/** One of the two browser builds the pinned image carries. */
export type BrowserBuild = {
  /** The Playwright channel that launches this build. */
  channel: "chromium" | "chromium-headless-shell";
  /** The headless flavor, in the words ADR-0002 uses for it. */
  flavor: string;
  /** The Playwright browser revision — the build paired with the package. */
  revision: string;
  /** The Chromium version that build reports. */
  version: string;
};

/** What binds a golden baseline: change any of it and the baselines it was
 *  taken under are baselines of another environment. */
export type RenderEnvironment = {
  image: {
    /** The base image, pinned by digest. */
    base: string;
    /** SHA-256 over the files that build the image on top of that base. The
     *  image's own digest is not it: a local build stamps its own metadata, so
     *  two machines building this recipe from this base never agree on one,
     *  and nothing reproducible could be committed here. */
    recipe: string;
  };
  /** The Playwright package version, which pairs the browser revisions below. */
  playwright: string;
  browsers: {
    /** What every render launches. */
    render: BrowserBuild;
    /** Launched by nothing but the cross-flavor parity fixture (issue 6bqdxe). */
    parity: BrowserBuild;
  };
  fonts: {
    /** The bundled font set's identity: SHA-256 over its Font Asset ids. */
    set: string;
    /** How many files that set holds. */
    files: number;
    /** SHA-256 of `fonts.conf`, the image's whole font configuration. */
    configuration: string;
  };
  /** The page every render starts from. A render resizes the viewport to the
   *  document's canvas; nothing else here moves. */
  page: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    locale: string;
    timezone: string;
    colorScheme: "light" | "dark";
  };
  /** SHA-256 over the compiler's sources: the markup is half of what a
   *  baseline holds, so a compiler change is an environment change. */
  compiler: string;
  /** The Design Document schema the compiler accepts. */
  schemaVersion: number;
};

/** Where the committed tuple lives, for the command that rewrites it. */
export const environmentFile = join(import.meta.dirname, "..", "environment.json");

/** The committed tuple. */
export const renderEnvironment = JSON.parse(
  readFileSync(environmentFile, "utf8"),
) as RenderEnvironment;

/** How to launch one of the image's two browser builds. Full Chromium in new
 *  headless mode is the render path (ADR-0002); the headless shell is the
 *  parity fixture's and nothing else's. */
export function launchOptions(build: BrowserBuild): LaunchOptions {
  return { channel: build.channel, headless: true };
}

/** The page settings a render inherits from the image instead of from the host
 *  it happens to run on. Playwright applies locale and timezone to the page
 *  itself, so a host environment that says otherwise cannot reach it. */
export function contextOptions(): BrowserContextOptions {
  const { page } = renderEnvironment;
  return {
    viewport: { ...page.viewport },
    deviceScaleFactor: page.deviceScaleFactor,
    locale: page.locale,
    timezoneId: page.timezone,
    colorScheme: page.colorScheme,
  };
}
