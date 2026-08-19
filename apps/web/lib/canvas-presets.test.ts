import { expect, test } from "vitest";

import { CANVAS_PRESETS, blankDesign, readDimension } from "./canvas-presets.ts";

/**
 * What a new design starts as.
 *
 * The presets are the spec's six (ek7pq1), and a preset carries nothing but a
 * name and dimensions — so what is asserted here is the document they produce,
 * which is the only thing the rest of the product ever sees.
 */

test("the square social preset creates a 1080 by 1080 document", () => {
  const preset = CANVAS_PRESETS.find(({ name }) => name === "Instagram post");

  expect(preset).toMatchObject({ width: 1080, height: 1080 });
});

test("a new design is white, empty, and the size it was asked for", () => {
  const document = blankDesign(1200, 630);

  expect(document).toEqual({
    schemaVersion: 1,
    canvas: { width: 1200, height: 630, background: "#ffffff" },
    elements: [],
  });
});

test("custom dimensions are whole pixels, at least one of them", () => {
  expect(readDimension("1080")).toBe(1080);
  expect(readDimension(" 1080 ")).toBe(1080);
  expect(readDimension("0")).toBeNull();
  expect(readDimension("-5")).toBeNull();
  expect(readDimension("10.5")).toBeNull();
  expect(readDimension("wide")).toBeNull();
  expect(readDimension("")).toBeNull();
});
