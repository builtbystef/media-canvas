// The image's golden check: run it inside the pinned image and it says
// whether a fixture still renders the picture a committed baseline froze.
//
//   pnpm --filter worker run image:check
//
// Baking is a different command (`goldens:bake`). This file never writes a
// baseline — a failure cannot quietly become the new expected picture.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { renderEnvironment } from "../environment.ts";
import { assertPinned } from "../goldens/bake.ts";
import {
  comparePngs,
  PARITY_MAX_DIFF_RATIO,
  PIXEL_THRESHOLD,
  WORKER_MAX_DIFF_RATIO,
} from "../goldens/compare.ts";
import {
  baselinePath,
  compiledFixture,
  fixtureRenderOptions,
  parityFixture,
  workerGoldens,
} from "../goldens/fixtures.ts";
import { render, renderWith } from "../render.ts";

assertPinned("golden checks");

for (const fixture of workerGoldens) {
  void test(`${fixture.name} matches its committed baseline at ratio 0`, async () => {
    const path = baselinePath(fixture.name);
    assert.equal(
      existsSync(path),
      true,
      `no baseline for "${fixture.name}"; bake it inside the pinned image with pnpm --filter worker run goldens:bake`,
    );
    const svg = compiledFixture(fixture);
    const actual = await render(svg, fixtureRenderOptions(fixture));
    const expected = new Uint8Array(readFileSync(path));
    const result = comparePngs(actual, expected, WORKER_MAX_DIFF_RATIO);
    assert.equal(
      result.passed,
      true,
      `"${fixture.name}" differed by ${String(result.diffPixels)} pixels ` +
        `(ratio ${result.diffRatio.toFixed(6)}) at threshold ${String(PIXEL_THRESHOLD)}`,
    );
  });
}

void test("cross-flavor parity stays under a 0.006 differing-pixel ratio", async () => {
  const svg = compiledFixture(parityFixture);
  const full = await renderWith(renderEnvironment.browsers.render, svg, {
    format: "png",
    scale: 1,
  });
  const shell = await renderWith(renderEnvironment.browsers.parity, svg, {
    format: "png",
    scale: 1,
  });
  const result = comparePngs(full, shell, PARITY_MAX_DIFF_RATIO);
  assert.equal(
    result.passed,
    true,
    `cross-flavor parity differed by ${String(result.diffPixels)} pixels ` +
      `(ratio ${result.diffRatio.toFixed(6)}); 0.006 admits glyph-edge AA, not a layout or fill change`,
  );
});
