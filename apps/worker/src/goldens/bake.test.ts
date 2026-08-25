import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { renderEnvironment } from "../environment.ts";
import { assertCanBake, bakeRefusal } from "./bake.ts";

test("baking refuses to run outside the pinned worker image", () => {
  expect(() => assertCanBake()).toThrow(/outside the pinned worker image/i);
  expect(
    bakeRefusal({
      insideImage: false,
      running: renderEnvironment,
      committed: renderEnvironment,
    }),
  ).toMatch(/outside the pinned worker image/i);
});

test("baking refuses to run against a mismatched environment tuple", () => {
  expect(
    bakeRefusal({
      insideImage: true,
      running: { ...renderEnvironment, compiler: "not-the-committed-compiler" },
      committed: renderEnvironment,
    }),
  ).toMatch(/mismatched environment tuple/i);
});

test("baking is allowed only inside the image with a matching tuple", () => {
  expect(
    bakeRefusal({
      insideImage: true,
      running: renderEnvironment,
      committed: renderEnvironment,
    }),
  ).toBeUndefined();
});

test("a failing check does not write a baseline", () => {
  const check = readFileSync(join(import.meta.dirname, "..", "checks", "golden.check.ts"), "utf8");
  expect(check).not.toMatch(/bakeBaselines|writeFileSync/);
  expect(check).toMatch(/This file never writes/);
});

test("the re-bake policy is written down", () => {
  const policy = readFileSync(
    join(import.meta.dirname, "..", "..", "goldens", "README.md"),
    "utf8",
  );
  expect(policy).toMatch(
    /whole suite is re-baked only after a deliberate environment-tuple change/,
  );
  expect(policy).toMatch(/old and new tuples/);
  expect(policy).toMatch(/intended rendering change/);
  expect(policy).toMatch(/only the fixtures it affects/);
  expect(policy).not.toMatch(/Git LFS|git-lfs/);
});
