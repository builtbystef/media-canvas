import type { Element, ImageElement, TextElement } from "@media-canvas/core";
import { compile, resolve, validate, validateDocument } from "@media-canvas/core";
import { bundledFonts } from "@media-canvas/fonts";
import { expect, test } from "vitest";

import {
  anchors,
  compiledFixture,
  composite,
  fills,
  fitModes,
  fixtureRenderOptions,
  fontFixtures,
  groups,
  nonsquare,
  scale2x,
  template,
  workerGoldens,
} from "./fixtures.ts";

const BUNDLED_FAMILIES = [
  "Inter",
  "Montserrat",
  "Lora",
  "Playfair Display",
  "Oswald",
  "Bebas Neue",
  "Pacifico",
  "Dancing Script",
  "JetBrains Mono",
] as const;

function walk(nodes: Element[]): Element[] {
  return nodes.flatMap((node) => (node.type === "group" ? [node, ...walk(node.children)] : [node]));
}

function texts(fixture: { template: { elements: Element[] } }): TextElement[] {
  return walk(fixture.template.elements).filter((el): el is TextElement => el.type === "text");
}

function images(fixture: { template: { elements: Element[] } }): ImageElement[] {
  return walk(fixture.template.elements).filter((el): el is ImageElement => el.type === "image");
}

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

test("there is one font fixture per bundled family, covering every face and .notdef", () => {
  expect(fontFixtures.map((fixture) => fixture.name)).toEqual(
    BUNDLED_FAMILIES.map((family) => `font-${family.toLowerCase().replaceAll(" ", "-")}`),
  );

  for (const family of BUNDLED_FAMILIES) {
    const fixture = fontFixtures.find((candidate) =>
      candidate.name.endsWith(family.toLowerCase().replaceAll(" ", "-")),
    );
    expect(fixture, family).toBeDefined();
    const used = new Set(texts(fixture!).map((el) => el.fontAssetId));
    const faces = bundledFonts.filter((font) => font.family === family);
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(used.has(face.id), `${family} ${String(face.weight)} ${face.style}`).toBe(true);
    }
    expect(
      texts(fixture!).some((el) => el.content.includes("☃")),
      `${family} has no .notdef character`,
    ).toBe(true);
  }
});

test("the anchors fixture crosses every vertical anchor with every horizontal align, each wrapped", () => {
  const blocks = texts(anchors).filter((el) => el.content.includes(" "));
  const seen = new Set(blocks.map((el) => `${el.anchor}/${el.align}`));
  expect(seen).toEqual(
    new Set(
      ["top", "middle", "bottom"].flatMap((anchor) =>
        ["left", "center", "right"].map((align) => `${anchor}/${align}`),
      ),
    ),
  );
  expect(blocks.every((el) => el.content === "LIMITED OFFER" && el.width === 120)).toBe(true);
});

test("the fills fixture covers radial and solid fills, borders, and per-corner radii", () => {
  const all = walk(fills.template.elements);
  expect(
    all.some(
      (el) =>
        (el.type === "rect" || el.type === "ellipse") &&
        typeof el.fill === "object" &&
        "type" in el.fill &&
        el.fill.type === "radial",
    ),
  ).toBe(true);
  expect(
    all.some((el) => (el.type === "rect" || el.type === "ellipse") && typeof el.fill === "string"),
  ).toBe(true);
  expect(all.some((el) => "border" in el && el.border !== undefined)).toBe(true);
  expect(
    all.some(
      (el) =>
        el.type === "rect" &&
        typeof el.cornerRadius === "object" &&
        el.cornerRadius.topLeft !== el.cornerRadius.topRight,
    ),
  ).toBe(true);
});

test("the groups fixture nests, hides a child, and hides a group", () => {
  const nested = groups.template.elements.filter((el) => el.type === "group");
  expect(nested.some((group) => group.children.some((child) => child.type === "group"))).toBe(true);
  expect(
    nested.some(
      (group) => group.visible === true && group.children.some((child) => child.visible === false),
    ),
  ).toBe(true);
  expect(nested.some((group) => group.visible === false && group.children.length > 0)).toBe(true);
});

test("the fit-modes fixture covers cover, contain, and stretch on a transparent asset and a photograph", () => {
  const frames = images(fitModes);
  const keys = new Set(
    frames.map((el) => `${el.fitMode}:${typeof el.src === "string" ? el.src : ""}`),
  );
  expect(frames).toHaveLength(6);
  for (const mode of ["cover", "contain", "stretch"] as const) {
    const ofMode = frames.filter((el) => el.fitMode === mode);
    expect(ofMode, mode).toHaveLength(2);
    expect(new Set(ofMode.map((el) => el.src)).size, mode).toBe(2);
  }
  expect(keys.size).toBe(6);
});

test("one fixture is a non-square canvas, and one is exported at 2×", () => {
  expect(nonsquare.template.canvas.width).not.toBe(nonsquare.template.canvas.height);
  expect(fixtureRenderOptions(nonsquare)).toEqual({ format: "png", scale: 1 });
  expect(fixtureRenderOptions(scale2x)).toEqual({ format: "png", scale: 2 });
});

test("the template fixture is a row against declared Variables, including a default", () => {
  const decls = template.template.variables ?? [];
  const byName = Object.fromEntries(decls.map((decl) => [decl.name, decl]));
  expect(byName.title?.type).toBe("text");
  expect(byName.photo?.type).toBe("image");
  expect(byName.accent?.type).toBe("color");
  expect(byName.price?.type).toBe("number");
  expect(byName.showBadge?.type).toBe("boolean");
  expect(byName.tagline?.type).toBe("text");
  expect(byName.tagline?.default).toEqual(expect.any(String));
  expect(template.values.tagline).toBeUndefined();

  const resolved = resolve(template.template, template.values);
  const svg = compiledFixture(template);
  expect(svg).toContain(String(byName.tagline?.default));
  expect(svg).toContain("Price: 4.99");
  expect(texts({ template: resolved }).some((el) => el.content === "LIMITED OFFER")).toBe(true);
  expect(texts(template).some((el) => el.content === "LIMITED OFFER" && el.width === 120)).toBe(
    true,
  );
  expect(texts(template).some((el) => el.content === "LIMITED OFFER" && el.width === 290)).toBe(
    true,
  );
  expect(images(template).some((el) => typeof el.src === "object" && el.src.$var === "photo")).toBe(
    true,
  );
  expect(
    walk(template.template.elements).some(
      (el) => el.type === "rect" && typeof el.fill === "object" && "$var" in el.fill,
    ),
  ).toBe(true);
  expect(
    walk(template.template.elements).some(
      (el) => typeof el.visible === "object" && el.visible.$var === "showBadge",
    ),
  ).toBe(true);
});

test("every named fixture is on the worker-output list", () => {
  const names = workerGoldens.map((fixture) => fixture.name);
  expect(names).toContain("composite");
  for (const fixture of fontFixtures) expect(names).toContain(fixture.name);
  expect(names).toEqual(
    expect.arrayContaining([
      "anchors",
      "fills",
      "groups",
      "fit-modes",
      "nonsquare",
      "scale-2x",
      "template",
    ]),
  );
  expect(new Set(names).size).toBe(names.length);
});
