import { compile, resolve, validate, validateDocument } from "@media-canvas/core";
import { expect, test } from "vitest";

import { compiledFixture, composite, workerGoldens } from "./fixtures.ts";

test("the composite fixture is a valid Design Document", () => {
  expect(validateDocument(composite.template)).toEqual([]);
  expect(validate(composite.template, composite.values)).toEqual([]);
});

test("the composite fixture is the prototype hard case", () => {
  const { elements } = composite.template;
  const walk = (nodes: typeof elements): typeof elements =>
    nodes.flatMap((node) => (node.type === "group" ? [node, ...walk(node.children)] : [node]));
  const all = walk(elements);

  expect(
    all.some(
      (el) =>
        el.type === "rect" &&
        typeof el.fill === "object" &&
        "type" in el.fill &&
        el.fill.type === "linear",
    ),
  ).toBe(true);
  expect(all.some((el) => "shadow" in el && el.shadow !== undefined)).toBe(true);
  expect(JSON.stringify(composite.template)).toMatch(/#[0-9A-Fa-f]{8}/);
  expect(all.some((el) => el.type === "image" && el.clip === "ellipse")).toBe(true);
  expect(
    all.some(
      (el) =>
        el.type === "image" &&
        el.content !== undefined &&
        (el.content.offsetX !== 0 || el.content.scale !== 1),
    ),
  ).toBe(true);
  expect(all.some((el) => el.rotation !== 0)).toBe(true);
  expect(all.some((el) => el.type === "group" && el.opacity < 1)).toBe(true);
  expect(all.some((el) => el.type === "vector")).toBe(true);
  expect(all.some((el) => el.type === "text" && el.content.includes(" "))).toBe(true);
});

test("the composite fixture resolves and compiles", () => {
  const svg = compiledFixture(composite);
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg).toContain("LIMITED OFFER");
  expect(svg).toContain("linearGradient");
  expect(() =>
    compile(resolve(composite.template, composite.values), composite.assets),
  ).not.toThrow();
});

test("golden fixtures are successful renders, not validation or missing-asset cases", () => {
  for (const fixture of workerGoldens) {
    expect(validate(fixture.template, fixture.values), fixture.name).toEqual([]);
    expect(() => compiledFixture(fixture), fixture.name).not.toThrow();
  }
});
