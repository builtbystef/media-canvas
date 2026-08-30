import { bundledFontBytes, bundledFonts } from "@media-canvas/fonts";

import type { AssetResolver } from "../src/assets.ts";
import { compile } from "../src/compile.ts";
import type { DesignDocument, Element } from "../src/document.ts";
import { createPreview } from "../src/preview.ts";

const regular = bundledFonts.find(
  (font) => font.family === "Inter" && font.weight === 400 && font.style === "normal",
)!;
const bold = bundledFonts.find(
  (font) => font.family === "Inter" && font.weight === 700 && font.style === "normal",
)!;

const assets: AssetResolver = {
  fontBytes(fontAssetId) {
    const font = bundledFonts.find((candidate) => candidate.id === fontAssetId);
    if (!font) throw new Error(`no bundled font ${fontAssetId}`);
    return bundledFontBytes(font);
  },
  imageUrl(src) {
    return `/api/v1/workspaces/w/images/${src}`;
  },
  imageSize() {
    return { width: 1600, height: 1200 };
  },
};

function leaf(index: number, texts: number): Element {
  const x = (index % 8) * 128 + 12;
  const y = Math.floor(index / 8) * 96 + 12;
  if (index < texts) {
    return {
      id: `text-${index}`,
      type: "text",
      x,
      y,
      width: 320,
      rotation: 0,
      opacity: 1,
      visible: true,
      content: index % 3 === 0 ? "Limited offer this week only" : "Save up to 40% today",
      fontAssetId: index % 2 === 0 ? regular.id : bold.id,
      fontSize: index % 2 === 0 ? 28 : 44,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: "left",
      anchor: "top",
      color: "#101828",
    };
  }
  if (index % 5 === 0) {
    return {
      id: `shape-${index}`,
      type: "ellipse",
      x,
      y,
      width: 96,
      height: 96,
      rotation: 12,
      opacity: 0.9,
      visible: true,
      fill: { type: "radial", stops: [{ offset: 0, color: "#7AA2F7" }] },
      shadow: { dx: 0, dy: 4, blur: 12, color: "#000000", opacity: 0.25 },
    };
  }
  return {
    id: `shape-${index}`,
    type: "rect",
    x,
    y,
    width: 120,
    height: 72,
    rotation: 0,
    opacity: 1,
    visible: true,
    cornerRadius: 8,
    fill:
      index % 3 === 0
        ? { type: "linear", angle: 45, stops: [{ offset: 0, color: "#1A56DB" }] }
        : "#D9D9D9",
    border: { color: "#35353B", width: 2 },
  };
}

function documentOf(topLevel: number, total: number, texts: number): DesignDocument {
  const leaves = Array.from({ length: total }, (_, index) => leaf(index, texts));
  const groups = total - topLevel;
  const elements: Element[] = [];
  for (let index = 0; index < groups; index += 1) {
    elements.push({
      id: `group-${index}`,
      type: "group",
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
      children: [leaves[index * 2]!, leaves[index * 2 + 1]!],
    });
  }
  elements.push(...leaves.slice(groups * 2));
  return {
    schemaVersion: 1,
    canvas: { width: 1080, height: 1080, background: "#FFFFFF" },
    elements,
  };
}

function nudged(doc: DesignDocument, frame: number): DesignDocument {
  const elements = [...doc.elements];
  const last = elements.at(-1)!;
  elements[elements.length - 1] = { ...last, x: last.x + (frame % 2 === 0 ? 1 : -1) };
  return { ...doc, elements };
}

function median(times: number[]): number {
  const sorted = [...times].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function took(work: () => void): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

function rebuilt(doc: DesignDocument): DesignDocument {
  return JSON.parse(JSON.stringify(doc)) as DesignDocument;
}

const shapes: [topLevel: number, total: number, texts: number][] = [
  [15, 26, 9],
  [30, 56, 19],
  [48, 92, 31],
  [60, 116, 39],
  [120, 236, 79],
];

createPreview(assets).update(documentOf(15, 26, 9));

console.log(
  "document (top-level / total / text) | svg | open | rebuild | dirty | gesture (p50/p95)",
);
for (const [topLevel, total, texts] of shapes) {
  const doc = documentOf(topLevel, total, texts);
  const preview = createPreview(assets);

  const open = took(() => void preview.update(doc));
  const size = compile(doc, assets).length;

  const rebuild = median(
    Array.from({ length: 10 }, () => {
      const fresh = rebuilt(doc);
      return took(() => void preview.update(fresh));
    }),
  );

  const dirty = median(
    Array.from({ length: 20 }, (_, index) =>
      took(
        () =>
          void preview.update({
            ...doc,
            canvas: { ...doc.canvas, width: 1080 + (index % 2) },
          }),
      ),
    ),
  );

  preview.update(doc);
  let held = doc;
  const gestures = Array.from({ length: 120 }, (_, frame) => {
    const next = nudged(held, frame);
    const spent = took(() => void preview.update(next));
    held = next;
    return spent;
  });
  const sorted = [...gestures].sort((first, second) => first - second);

  console.log(
    `${topLevel} / ${total} / ${texts} | ${Math.round(size / 1024)} KB | ` +
      `${open.toFixed(1)} | ${rebuild.toFixed(1)} | ${dirty.toFixed(1)} | ` +
      `${median(gestures).toFixed(3)} / ${sorted[Math.floor(sorted.length * 0.95)]!.toFixed(3)}`,
  );
}
