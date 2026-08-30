import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BrowserContextOptions, LaunchOptions } from "playwright-core";

export type BrowserBuild = {
  channel: "chromium" | "chromium-headless-shell";
  flavor: string;
  revision: string;
  version: string;
};

export type RenderEnvironment = {
  image: {
    base: string;
    recipe: string;
  };
  playwright: string;
  browsers: {
    render: BrowserBuild;
    parity: BrowserBuild;
  };
  fonts: {
    set: string;
    files: number;
    configuration: string;
  };
  page: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    locale: string;
    timezone: string;
    colorScheme: "light" | "dark";
  };
  compiler: string;
  schemaVersion: number;
};

export const environmentFile = join(import.meta.dirname, "..", "environment.json");

export const renderEnvironment = JSON.parse(
  readFileSync(environmentFile, "utf8"),
) as RenderEnvironment;

export function launchOptions(build: BrowserBuild): LaunchOptions {
  return { channel: build.channel, headless: true };
}

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
