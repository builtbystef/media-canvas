// The named golden fixtures (issue 6bqdxe). The composite is the prototype
// hard-case document: one Design Document that puts a linear gradient, a
// shadow, an alpha fill, an ellipse-clipped crop, rotation, group opacity,
// a vector, and wrapped text on the same canvas. Missing values, missing
// assets, and validation failures are not fixtures — those stay at the
// validate and compile seams.

import { createHash } from "node:crypto";
import { join } from "node:path";

import type { AssetResolver, DesignDocument, ValidationError } from "@media-canvas/core";
import { compile, resolve, validate } from "@media-canvas/core";
import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";

import { writePng } from "./png.ts";

export type GoldenFixture = {
  name: string;
  template: DesignDocument;
  values: Record<string, unknown>;
  assets: AssetResolver;
};

/** Where committed worker-output baselines live, next to this package. */
export const baselinesDirectory = join(import.meta.dirname, "..", "..", "goldens", "baselines");

export function baselinePath(name: string): string {
  return join(baselinesDirectory, `${name}.png`);
}

function bundled(family: string, weight: number): string {
  const font = bundledFonts.find(
    (candidate) =>
      candidate.family === family && candidate.weight === weight && candidate.style === "normal",
  );
  if (!font) throw new Error(`the bundled set has no ${family} ${weight}`);
  return font.id;
}

/** The prototype's sample photo: 800×600 gradient with three circles. */
function samplePhoto(): { id: string; bytes: Uint8Array; width: number; height: number } {
  const width = 800;
  const height = 600;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round(40 + (x / width) * 180);
      data[i + 1] = Math.round(80 + (y / height) * 120);
      data[i + 2] = Math.round(200 - (x / width) * 120);
      data[i + 3] = 255;
    }
  }
  for (const [cx, cy, r, rgb] of [
    [200, 180, 90, [255, 209, 102]],
    [560, 340, 130, [239, 71, 111]],
    [400, 480, 70, [255, 255, 255]],
  ] as const) {
    for (let y = cy - r; y < cy + r; y++) {
      for (let x = cx - r; x < cx + r; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (y * width + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
  }
  const bytes = writePng(width, height, data);
  const id = createHash("sha256").update(bytes).digest("hex");
  return { id, bytes, width, height };
}

const photo = samplePhoto();
const photoDataUri = `data:image/png;base64,${Buffer.from(photo.bytes).toString("base64")}`;

const fontsById = new Map(bundledFonts.map((font) => [font.id, font]));

/** Fonts from the bundled set, the sample photo as a data URI so the compiled
 *  markup is self-contained — the same contract production inlining uses. */
export const fixtureAssets: AssetResolver = {
  fontBytes(fontAssetId) {
    const font = fontsById.get(fontAssetId);
    if (!font) throw new Error(`no bundled Font Asset "${fontAssetId}"`);
    return bundledFontBytes(font);
  },
  imageUrl(src) {
    if (src !== photo.id) throw new Error(`no Image Asset "${src}"`);
    return photoDataUri;
  },
  imageSize(src) {
    if (src !== photo.id) throw new Error(`no Image Asset "${src}"`);
    return { width: photo.width, height: photo.height };
  },
};

/** A 5-point star centred in a 180×180 viewBox — the prototype's vector. */
function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

const oswaldBold = bundled("Oswald", 700);
const interRegular = bundled("Inter", 400);

/** The prototype composite, restated in the v1 schema: `direction: diagonal`
 *  is angle 45 (0 is left→right, clockwise); Lato became Oswald Bold for the
 *  badge (the face the compile worked example measures) and Inter for the
 *  body; every ElementBase field the schema requires is filled. */
function compositeDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 1080, height: 1080, background: "#F4EFE8" },
    elements: [
      {
        id: "hero",
        type: "rect",
        x: 60,
        y: 60,
        width: 960,
        height: 520,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: {
          type: "linear",
          angle: 45,
          stops: [
            { offset: 0, color: "#FF6B35" },
            { offset: 1, color: "#7A1FA2" },
          ],
        },
        shadow: { dx: 0, dy: 12, blur: 24, color: "#000000", opacity: 0.35 },
      },
      {
        id: "photo",
        type: "image",
        x: 120,
        y: 140,
        width: 400,
        height: 360,
        rotation: -6,
        opacity: 1,
        visible: true,
        src: photo.id,
        naturalWidth: 800,
        naturalHeight: 600,
        content: { offsetX: -80, offsetY: -40, scale: 0.72 },
        fitMode: "cover",
        clip: "ellipse",
      },
      {
        id: "sun",
        type: "ellipse",
        x: 760,
        y: 120,
        width: 220,
        height: 220,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: "#FFD166CC",
      },
      {
        id: "star",
        type: "vector",
        x: 800,
        y: 380,
        width: 180,
        height: 180,
        rotation: 15,
        opacity: 1,
        visible: true,
        path: starPath(90, 90, 90, 36),
        viewBox: { width: 180, height: 180 },
        fill: "#06D6A0",
      },
      {
        id: "badge",
        type: "group",
        x: 620,
        y: 470,
        rotation: 3,
        opacity: 0.85,
        visible: true,
        children: [
          {
            id: "badge-bg",
            type: "rect",
            x: 0,
            y: 0,
            width: 330,
            height: 80,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: "#1D3557",
          },
          {
            id: "badge-label",
            type: "text",
            x: 25,
            y: 40,
            width: 290,
            rotation: 0,
            opacity: 1,
            visible: true,
            content: "LIMITED OFFER",
            fontAssetId: oswaldBold,
            fontSize: 30,
            lineHeight: 1.2,
            letterSpacing: 0,
            align: "left",
            anchor: "middle",
            color: "#FFFFFF",
          },
        ],
      },
      {
        id: "headline",
        type: "text",
        x: 60,
        y: 640,
        width: 720,
        rotation: 0,
        opacity: 1,
        visible: true,
        content: "Summer Sale — Up to 50% Off Everything You Love",
        fontAssetId: oswaldBold,
        fontSize: 64,
        lineHeight: 1.15,
        letterSpacing: 0,
        align: "left",
        anchor: "top",
        color: "#1D3557",
      },
      {
        id: "body",
        type: "text",
        x: 60,
        y: 880,
        width: 640,
        rotation: 0,
        opacity: 1,
        visible: true,
        content:
          "Fresh drops every week, free shipping over €50, and the fine print stays fine. Kerning check: AVATAR Wave.",
        fontAssetId: interRegular,
        fontSize: 28,
        lineHeight: 1.4,
        letterSpacing: 0,
        align: "left",
        anchor: "top",
        color: "#1D3557CC",
      },
    ],
  };
}

export const composite: GoldenFixture = {
  name: "composite",
  template: compositeDocument(),
  values: {},
  assets: fixtureAssets,
};

/** Worker-output goldens: each has a committed baseline and a ratio of 0. */
export const workerGoldens: readonly GoldenFixture[] = [composite];

/** The named cross-flavor parity fixture. Same document as the composite —
 *  that is the picture the prototype measured 0.534% on — compared live
 *  between the two browser builds, not against a baseline. */
export const parityFixture: GoldenFixture = composite;

function formatErrors(errors: ValidationError[]): string {
  return errors.map((error) => error.message).join("; ");
}

/** validate → resolve → compile. The golden check and the bake command both
 *  start here, so a fixture that will not compile never reaches a browser. */
export function compiledFixture(fixture: GoldenFixture): string {
  const errors = validate(fixture.template, fixture.values);
  if (errors.length > 0) {
    throw new Error(`fixture "${fixture.name}" failed validation: ${formatErrors(errors)}`);
  }
  return compile(resolve(fixture.template, fixture.values), fixture.assets);
}
