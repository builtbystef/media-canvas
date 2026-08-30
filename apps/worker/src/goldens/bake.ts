import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import type { RenderEnvironment } from "../environment.ts";
import { renderEnvironment } from "../environment.ts";
import { render } from "../render.ts";
import { computeEnvironment } from "../write-environment.ts";
import {
  baselinePath,
  baselinesDirectory,
  compiledFixture,
  fixtureRenderOptions,
  workerGoldens,
} from "./fixtures.ts";

const IMAGE_BROWSERS_PATH = "/opt/playwright-browsers";

export type BakeObservation = {
  insideImage: boolean;
  running: RenderEnvironment;
  committed: RenderEnvironment;
};

export function bakeRefusal(observation: BakeObservation): string | undefined {
  if (!observation.insideImage) {
    return "baking refuses to run outside the pinned worker image";
  }
  if (JSON.stringify(observation.running) !== JSON.stringify(observation.committed)) {
    return "baking refuses to run against a mismatched environment tuple";
  }
  return undefined;
}

export function observeBakeEnvironment(): BakeObservation {
  return {
    insideImage:
      process.env.PLAYWRIGHT_BROWSERS_PATH === IMAGE_BROWSERS_PATH &&
      existsSync(IMAGE_BROWSERS_PATH),
    running: computeEnvironment(),
    committed: renderEnvironment,
  };
}

export function assertCanBake(): void {
  assertPinned("baking");
}

export function assertPinned(action: string): void {
  const observation = observeBakeEnvironment();
  if (!observation.insideImage) {
    throw new Error(`${action} refuses to run outside the pinned worker image`);
  }
  if (JSON.stringify(observation.running) !== JSON.stringify(observation.committed)) {
    throw new Error(`${action} refuses to run against a mismatched environment tuple`);
  }
}

export async function bakeBaselines(): Promise<string[]> {
  assertCanBake();
  mkdirSync(baselinesDirectory, { recursive: true });
  const written: string[] = [];
  for (const fixture of workerGoldens) {
    const svg = compiledFixture(fixture);
    const png = await render(svg, fixtureRenderOptions(fixture));
    const path = baselinePath(fixture.name);
    writeFileSync(path, png);
    written.push(path);
  }
  return written;
}
