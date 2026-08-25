// Baking a baseline is a separate, deliberate act (issue 6bqdxe). It refuses
// to run outside the pinned image or against a mismatched environment tuple,
// and the golden check never calls it — a failure cannot quietly re-record
// the picture that just failed.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import type { RenderEnvironment } from "../environment.ts";
import { renderEnvironment } from "../environment.ts";
import { render } from "../render.ts";
import { computeEnvironment } from "../write-environment.ts";
import { baselinePath, baselinesDirectory, compiledFixture, workerGoldens } from "./fixtures.ts";

const IMAGE_BROWSERS_PATH = "/opt/playwright-browsers";

export type BakeObservation = {
  /** True only when this process is the pinned image: the image's own browser
   *  path, present on disk. A host that happens to have Playwright installed
   *  does not count. */
  insideImage: boolean;
  running: RenderEnvironment;
  committed: RenderEnvironment;
};

/** Why baking must not proceed, or `undefined` if it may. */
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

/** The golden check uses the same observations as bake, with its own words. */
export function assertPinned(action: string): void {
  const observation = observeBakeEnvironment();
  if (!observation.insideImage) {
    throw new Error(`${action} refuses to run outside the pinned worker image`);
  }
  if (JSON.stringify(observation.running) !== JSON.stringify(observation.committed)) {
    throw new Error(`${action} refuses to run against a mismatched environment tuple`);
  }
}

/** Render each worker-output fixture and write its lossless PNG. The parity
 *  fixture has no baseline — it compares two live renders. */
export async function bakeBaselines(): Promise<string[]> {
  assertCanBake();
  mkdirSync(baselinesDirectory, { recursive: true });
  const written: string[] = [];
  for (const fixture of workerGoldens) {
    const svg = compiledFixture(fixture);
    const png = await render(svg, { format: "png", scale: 1 });
    const path = baselinePath(fixture.name);
    writeFileSync(path, png);
    written.push(path);
  }
  return written;
}
