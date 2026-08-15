import { expect, test } from "vitest";

import { DESIGN_DOCUMENT_SCHEMA_VERSION } from "./index";

test("schema version is a positive integer", () => {
  expect(Number.isInteger(DESIGN_DOCUMENT_SCHEMA_VERSION)).toBe(true);
  expect(DESIGN_DOCUMENT_SCHEMA_VERSION).toBeGreaterThan(0);
});
