import type { FontAssetView } from "@media-canvas/api-client";
import type { DesignDocument, Element } from "@media-canvas/core";

import { refusalMessage } from "./image-placement.ts";

export type FontFamilyGroup = {
  family: string;
  bundled: boolean;
  faces: FontAssetView[];
};

export function groupFontsForPicker(fonts: readonly FontAssetView[]): FontFamilyGroup[] {
  const byFamily = new Map<string, FontAssetView[]>();
  for (const face of fonts) {
    const held = byFamily.get(face.family) ?? [];
    held.push(face);
    byFamily.set(face.family, held);
  }
  const groups: FontFamilyGroup[] = [...byFamily.entries()].map(([family, faces]) => ({
    family,
    bundled: faces.every((face) => face.bundled),
    faces: [...faces].sort(byWeightThenItalic),
  }));
  return groups.sort((left, right) => {
    if (left.bundled !== right.bundled) return left.bundled ? -1 : 1;
    return left.family.localeCompare(right.family);
  });
}

export function fontsForPanel(fonts: readonly FontAssetView[]): {
  bundled: FontAssetView[];
  uploaded: FontAssetView[];
} {
  const bundled = fonts
    .filter((face) => face.bundled)
    .sort((left, right) => {
      const family = left.family.localeCompare(right.family);
      return family === 0 ? byWeightThenItalic(left, right) : family;
    });
  const uploaded = fonts
    .filter((face) => !face.bundled)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { bundled, uploaded };
}

function byWeightThenItalic(left: FontAssetView, right: FontAssetView): number {
  if (left.weight !== right.weight) return left.weight - right.weight;
  if (left.italic !== right.italic) return left.italic ? 1 : -1;
  return left.subfamily.localeCompare(right.subfamily);
}

export function countAssetUsages(document: DesignDocument, assetId: string): number {
  let count = 0;
  const visit = (elements: readonly Element[]) => {
    for (const element of elements) {
      if (element.type === "text" && element.fontAssetId === assetId) count += 1;
      else if (element.type === "image" && element.src === assetId) count += 1;
      else if (element.type === "group") visit(element.children);
    }
  };
  visit(document.elements);
  return count;
}

const GENERIC_DELETION =
  "Any design or template using this will fail to render until it is replaced.";

export function describeAssetDeletion(usageCount: number): string {
  if (usageCount === 0) return GENERIC_DELETION;
  const noun = usageCount === 1 ? "element" : "elements";
  return `Used by ${String(usageCount)} ${noun} in this document. ${GENERIC_DELETION}`;
}

export type FontUploadResult = { ok: true; font: FontAssetView } | { ok: false; error: unknown };

export type FinishedFontUpload =
  | { kind: "selected"; font: FontAssetView }
  | { kind: "rejected"; message: string };

export function finishFontUpload(result: FontUploadResult): FinishedFontUpload {
  return result.ok
    ? { kind: "selected", font: result.font }
    : { kind: "rejected", message: refusalMessage(result.error) };
}

export function fontFaceName(fontAssetId: string): string {
  return `asset-face-${fontAssetId}`;
}

export function fontFaceLabel(font: FontAssetView): string {
  return `${font.family} ${font.subfamily}`;
}
