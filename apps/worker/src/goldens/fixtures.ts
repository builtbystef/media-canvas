// The named golden fixtures (issues 6bqdxe, oaf94x). The composite is the prototype
// hard-case document: one Design Document that puts a linear gradient, a
// shadow, an alpha fill, an ellipse-clipped crop, rotation, group opacity,
// a vector, and wrapped text on the same canvas. Missing values, missing
// assets, and validation failures are not fixtures — those stay at the
// validate and compile seams.

import { createHash } from "node:crypto";
import { join } from "node:path";

import type {
  AssetResolver,
  DesignDocument,
  Element,
  ImageElement,
  RectElement,
  TextElement,
  ValidationError,
} from "@media-canvas/core";
import { compile, resolve, validate } from "@media-canvas/core";
import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";

import { writePng } from "./png.ts";

export type GoldenFixture = {
  name: string;
  template: DesignDocument;
  values: Record<string, unknown>;
  assets: AssetResolver;
  /** PNG deviceScaleFactor. Worker-output goldens default to 1×. */
  scale?: 1 | 2 | 3;
};

/** What `render` is called with for this fixture. The 2× fixture is the
 *  only one that leaves the default. */
export function fixtureRenderOptions(fixture: GoldenFixture): { format: "png"; scale: 1 | 2 | 3 } {
  return { format: "png", scale: fixture.scale ?? 1 };
}

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

type Raster = { id: string; uri: string; width: number; height: number };

function asRaster(image: { id: string; bytes: Uint8Array; width: number; height: number }): Raster {
  return {
    id: image.id,
    uri: `data:image/png;base64,${Buffer.from(image.bytes).toString("base64")}`,
    width: image.width,
    height: image.height,
  };
}

const photo = asRaster(samplePhoto());

/** A 400×200 landscape with an opaque disk on a transparent field — cover,
 *  contain, and stretch place it differently inside a square frame. */
function sampleTransparent(): Raster {
  const width = 400;
  const height = 200;
  const data = new Uint8Array(width * height * 4);
  const cx = 200;
  const cy = 100;
  const r = 80;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * width + x) * 4;
      data[i] = 6;
      data[i + 1] = 214;
      data[i + 2] = 160;
      data[i + 3] = 255;
    }
  }
  const bytes = writePng(width, height, data);
  return asRaster({
    id: createHash("sha256").update(bytes).digest("hex"),
    bytes,
    width,
    height,
  });
}

const transparent = sampleTransparent();
const rasters = new Map<string, Raster>([
  [photo.id, photo],
  [transparent.id, transparent],
]);

const fontsById = new Map(bundledFonts.map((font) => [font.id, font]));

/** Fonts from the bundled set, sample images as data URIs so the compiled
 *  markup is self-contained — the same contract production inlining uses. */
export const fixtureAssets: AssetResolver = {
  fontBytes(fontAssetId) {
    const font = fontsById.get(fontAssetId);
    if (!font) throw new Error(`no bundled Font Asset "${fontAssetId}"`);
    return bundledFontBytes(font);
  },
  imageUrl(src) {
    const raster = rasters.get(src);
    if (!raster) throw new Error(`no Image Asset "${src}"`);
    return raster.uri;
  },
  imageSize(src) {
    const raster = rasters.get(src);
    if (!raster) throw new Error(`no Image Asset "${src}"`);
    return { width: raster.width, height: raster.height };
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

function textBox(
  id: string,
  x: number,
  y: number,
  width: number,
  content: string,
  fontAssetId: string,
  extra: Partial<TextElement> = {},
): TextElement {
  return {
    id,
    type: "text",
    x,
    y,
    width,
    rotation: 0,
    opacity: 1,
    visible: true,
    content,
    fontAssetId,
    fontSize: 28,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "left",
    anchor: "top",
    color: "#1D3557",
    ...extra,
  };
}

function rectBox(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<RectElement> = {},
): RectElement {
  return {
    id,
    type: "rect",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#FFFFFF",
    ...extra,
  };
}

function familySlug(family: string): string {
  return family.toLowerCase().replaceAll(" ", "-");
}

function familiesInManifestOrder(): string[] {
  const families: string[] = [];
  for (const font of bundledFonts) {
    if (!families.includes(font.family)) families.push(font.family);
  }
  return families;
}

function fontFamilyFixture(family: string): GoldenFixture {
  const faces = bundledFonts
    .filter((font) => font.family === family)
    .toSorted((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
  const line = 52;
  const elements: Element[] = faces.map((face, index) => {
    const style = face.style === "italic" ? " italic" : "";
    return textBox(
      `face-${String(face.weight)}-${face.style}`,
      24,
      20 + index * line,
      592,
      `${family} ${String(face.weight)}${style}  Ag`,
      face.id,
      { fontSize: 32 },
    );
  });
  const notdefFace =
    faces.find((face) => face.weight === 400 && face.style === "normal") ?? faces[0]!;
  elements.push(
    textBox("notdef", 24, 20 + faces.length * line, 592, "missing glyph: A☃", notdefFace.id, {
      fontSize: 32,
    }),
  );
  return {
    name: `font-${familySlug(family)}`,
    template: {
      schemaVersion: 1,
      canvas: {
        width: 640,
        height: 20 + (faces.length + 1) * line + 24,
        background: "#F4EFE8",
      },
      elements,
    },
    values: {},
    assets: fixtureAssets,
  };
}

/** One fixture per bundled family: every weight and style, plus .notdef. */
export const fontFixtures: readonly GoldenFixture[] =
  familiesInManifestOrder().map(fontFamilyFixture);

const ALIGNS = ["left", "center", "right"] as const;
const ANCHORS = ["top", "middle", "bottom"] as const;

function anchorsDocument(): DesignDocument {
  const cellW = 200;
  const cellH = 180;
  const pad = 16;
  const wrap = 120;
  const elements: Element[] = [];
  for (const [column, align] of ALIGNS.entries()) {
    for (const [row, anchor] of ANCHORS.entries()) {
      const cellX = pad + column * cellW;
      const cellY = pad + row * cellH;
      const x = cellX + (cellW - wrap) / 2;
      const y = cellY + cellH / 2;
      const markX = align === "left" ? x : align === "center" ? x + wrap / 2 : x + wrap;
      elements.push(
        rectBox(`cell-${anchor}-${align}`, cellX + 4, cellY + 4, cellW - 8, cellH - 8, {
          fill: "#FFFFFF",
          border: { color: "#D6D3CD", width: 1 },
        }),
        textBox(`text-${anchor}-${align}`, x, y, wrap, "LIMITED OFFER", oswaldBold, {
          fontSize: 30,
          align,
          anchor,
        }),
        rectBox(`mark-${anchor}-${align}`, markX - 4, y - 4, 8, 8, { fill: "#E63946" }),
      );
    }
  }
  return {
    schemaVersion: 1,
    canvas: {
      width: pad * 2 + cellW * ALIGNS.length,
      height: pad * 2 + cellH * ANCHORS.length,
      background: "#F4EFE8",
    },
    elements,
  };
}

export const anchors: GoldenFixture = {
  name: "anchors",
  template: anchorsDocument(),
  values: {},
  assets: fixtureAssets,
};

function fillsDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 640, height: 400, background: "#F4EFE8" },
    elements: [
      rectBox("solid", 40, 40, 240, 160, {
        fill: "#FF6B35",
        border: { color: "#1D3557", width: 8 },
      }),
      {
        id: "radial",
        type: "ellipse",
        x: 360,
        y: 40,
        width: 240,
        height: 160,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: {
          type: "radial",
          stops: [
            { offset: 0, color: "#FFD166" },
            { offset: 1, color: "#7A1FA2" },
          ],
        },
        border: { color: "#1D3557", width: 6 },
      },
      rectBox("corners", 40, 240, 260, 120, {
        fill: "#06D6A0",
        border: { color: "#1D3557", width: 4 },
        cornerRadius: { topLeft: 40, topRight: 8, bottomRight: 0, bottomLeft: 24 },
      }),
      rectBox("radial-rect", 340, 240, 260, 120, {
        fill: {
          type: "radial",
          stops: [
            { offset: 0, color: "#FFFFFF" },
            { offset: 1, color: "#1D3557" },
          ],
        },
        cornerRadius: 24,
      }),
    ],
  };
}

export const fills: GoldenFixture = {
  name: "fills",
  template: fillsDocument(),
  values: {},
  assets: fixtureAssets,
};

function groupsDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 640, height: 400, background: "#F4EFE8" },
    elements: [
      {
        id: "stage",
        type: "group",
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        visible: true,
        children: [
          {
            id: "back-layer",
            type: "group",
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            visible: true,
            children: [rectBox("back", 40, 40, 280, 200, { fill: "#E63946" })],
          },
          rectBox("hidden-child", 80, 80, 200, 120, {
            fill: "#00FF00",
            visible: false,
          }),
          rectBox("mid", 100, 80, 200, 160, { fill: "#457B9D" }),
        ],
      },
      {
        id: "hidden-group",
        type: "group",
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        visible: false,
        children: [rectBox("would-show", 0, 0, 400, 400, { fill: "#FFFF00" })],
      },
      rectBox("front", 180, 120, 220, 180, { fill: "#1D3557" }),
    ],
  };
}

export const groups: GoldenFixture = {
  name: "groups",
  template: groupsDocument(),
  values: {},
  assets: fixtureAssets,
};

function fitFrame(
  id: string,
  x: number,
  y: number,
  src: string,
  fitMode: ImageElement["fitMode"],
  naturalWidth: number,
  naturalHeight: number,
): ImageElement {
  return {
    id,
    type: "image",
    x,
    y,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    src,
    naturalWidth,
    naturalHeight,
    fitMode,
    clip: "none",
  };
}

function fitModesDocument(): DesignDocument {
  const modes = ["cover", "contain", "stretch"] as const;
  const elements: Element[] = [];
  for (const [column, mode] of modes.entries()) {
    const x = 24 + column * 232;
    elements.push(
      textBox(`label-t-${mode}`, x, 16, 200, `${mode} / transparent`, interRegular, {
        fontSize: 16,
      }),
      fitFrame(`t-${mode}`, x, 40, transparent.id, mode, transparent.width, transparent.height),
      textBox(`label-p-${mode}`, x, 260, 200, `${mode} / photo`, interRegular, {
        fontSize: 16,
      }),
      fitFrame(`p-${mode}`, x, 284, photo.id, mode, photo.width, photo.height),
    );
  }
  return {
    schemaVersion: 1,
    canvas: { width: 720, height: 508, background: "#F4EFE8" },
    elements,
  };
}

export const fitModes: GoldenFixture = {
  name: "fit-modes",
  template: fitModesDocument(),
  values: {},
  assets: fixtureAssets,
};

export const nonsquare: GoldenFixture = {
  name: "nonsquare",
  template: {
    schemaVersion: 1,
    canvas: { width: 640, height: 360, background: "#1D3557" },
    elements: [
      rectBox("band", 0, 120, 640, 120, { fill: "#FF6B35" }),
      {
        id: "orb",
        type: "ellipse",
        x: 220,
        y: 80,
        width: 200,
        height: 200,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: "#FFD166",
      },
      textBox("caption", 40, 160, 560, "640 × 360", oswaldBold, {
        fontSize: 48,
        align: "center",
        color: "#FFFFFF",
      }),
    ],
  },
  values: {},
  assets: fixtureAssets,
};

export const scale2x: GoldenFixture = {
  name: "scale-2x",
  scale: 2,
  template: {
    schemaVersion: 1,
    canvas: { width: 240, height: 120, background: "#F4EFE8" },
    elements: [
      rectBox("bar", 16, 16, 208, 88, {
        fill: {
          type: "linear",
          angle: 90,
          stops: [
            { offset: 0, color: "#FF6B35" },
            { offset: 1, color: "#7A1FA2" },
          ],
        },
        cornerRadius: 12,
      }),
      textBox("label", 16, 60, 208, "2×", oswaldBold, {
        fontSize: 48,
        align: "center",
        anchor: "middle",
        color: "#FFFFFF",
      }),
    ],
  },
  values: {},
  assets: fixtureAssets,
};

const TAGLINE_DEFAULT = "the default tagline";

function templateDocument(): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 640, height: 640, background: "#F4EFE8" },
    variables: [
      { name: "title", type: "text" },
      { name: "photo", type: "image" },
      { name: "accent", type: "color" },
      { name: "price", type: "number" },
      { name: "showBadge", type: "boolean" },
      { name: "tagline", type: "text", default: TAGLINE_DEFAULT },
    ],
    elements: [
      rectBox("hero", 40, 40, 560, 200, { fill: { $var: "accent" } }),
      {
        id: "hero-photo",
        type: "image",
        x: 60,
        y: 60,
        width: 200,
        height: 160,
        rotation: 0,
        opacity: 1,
        visible: true,
        src: { $var: "photo" },
        naturalWidth: 100,
        naturalHeight: 80,
        content: { offsetX: 0, offsetY: 0, scale: 1 },
        fitMode: "cover",
        clip: "none",
      },
      textBox("title", 280, 80, 300, "{{title}}", oswaldBold, {
        fontSize: 40,
        color: "#FFFFFF",
      }),
      textBox("price", 280, 160, 300, "Price: {{price}}", interRegular, {
        fontSize: 24,
        color: "#FFFFFF",
      }),
      {
        id: "badge",
        type: "group",
        x: 40,
        y: 260,
        rotation: 0,
        opacity: 1,
        visible: { $var: "showBadge" },
        children: [
          rectBox("badge-bg", 0, 0, 200, 48, { fill: "#1D3557" }),
          textBox("badge-label", 12, 24, 176, "ON SALE", oswaldBold, {
            fontSize: 22,
            anchor: "middle",
            color: "#FFFFFF",
          }),
        ],
      },
      textBox("tagline", 40, 330, 560, "{{tagline}}", interRegular, { fontSize: 22 }),
      textBox("wrap-wide", 40, 390, 290, "LIMITED OFFER", oswaldBold, { fontSize: 30 }),
      textBox("wrap-narrow", 40, 450, 120, "LIMITED OFFER", oswaldBold, { fontSize: 30 }),
    ],
  };
}

export const template: GoldenFixture = {
  name: "template",
  template: templateDocument(),
  values: {
    title: "Summer Sale",
    photo: photo.id,
    accent: "#FF6B35",
    price: 4.99,
    showBadge: true,
  },
  assets: fixtureAssets,
};

/** Worker-output goldens: each has a committed baseline and a ratio of 0. */
export const workerGoldens: readonly GoldenFixture[] = [
  composite,
  ...fontFixtures,
  anchors,
  fills,
  groups,
  fitModes,
  nonsquare,
  scale2x,
  template,
];

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
