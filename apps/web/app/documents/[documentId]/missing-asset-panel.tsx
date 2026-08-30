"use client";

import { uploadImage, type FontAssetView, type ImageAssetView } from "@media-canvas/api-client";
import { useRef, useState } from "react";
import { refusalMessage } from "../../../lib/image-placement";
import type { MissingAsset } from "../../../lib/missing-assets";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { FontPicker } from "./font-picker";

export function MissingAssetPanel({
  missing,
  fonts,
  images,
  workspaceId,
  mayEdit,
  onReplaceFont,
  onReplaceImage,
  onHoldFont,
  onFontAdded,
  onImageAdded,
}: {
  missing: readonly MissingAsset[];
  fonts: readonly FontAssetView[];
  images: readonly ImageAssetView[];
  workspaceId: string | null;
  mayEdit: boolean;
  onReplaceFont: (fromId: string, toId: string) => void;
  onReplaceImage: (fromId: string, image: ImageAssetView) => void;
  onHoldFont: (font: FontAssetView) => Promise<boolean>;
  onFontAdded: (font: FontAssetView) => void;
  onImageAdded: (image: ImageAssetView) => void;
}) {
  const [replacing, setReplacing] = useState<MissingAsset | null>(null);

  return (
    <div
      className="mx-auto w-full max-w-lg rounded-lg bg-card p-4 text-sm ring-1 ring-foreground/10"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <h2 className="font-heading text-base font-medium">This document cannot be drawn</h2>
      <p className="mt-1 text-muted-foreground">
        Replace each missing asset to restore the preview.
      </p>
      <ul className="mt-3 grid gap-3">
        {missing.map((asset) => (
          <li key={`${asset.kind}:${asset.id}`} className="rounded-md bg-muted/50 p-3">
            <p className="font-medium">{asset.kind === "font" ? "Font Asset" : "Image Asset"}</p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{asset.id}</p>
            <p className="mt-1 text-xs text-muted-foreground">{usedBy(asset.elementNames)}</p>
            {mayEdit && (
              <Button type="button" size="xs" className="mt-2" onClick={() => setReplacing(asset)}>
                Replace
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={replacing !== null} onOpenChange={(open) => !open && setReplacing(null)}>
        <DialogContent className="sm:max-w-md" onPointerDown={(event) => event.stopPropagation()}>
          {replacing !== null && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {replacing.kind === "font" ? "Replace Font Asset" : "Replace Image Asset"}
                </DialogTitle>
                <DialogDescription>
                  Choose a replacement. Every element that referenced the missing asset is
                  rewritten.
                </DialogDescription>
              </DialogHeader>
              {replacing.kind === "font" ? (
                <FontPicker
                  fonts={fonts}
                  value={{ kind: "same", value: replacing.id }}
                  workspaceId={workspaceId}
                  mayUpload={mayEdit}
                  onCommit={(fontAssetId) => {
                    onReplaceFont(replacing.id, fontAssetId);
                    setReplacing(null);
                  }}
                  onFontAdded={onFontAdded}
                  onHoldFont={onHoldFont}
                />
              ) : (
                <ImagePicker
                  images={images}
                  workspaceId={workspaceId}
                  mayUpload={mayEdit}
                  onPick={(image) => {
                    onReplaceImage(replacing.id, image);
                    setReplacing(null);
                  }}
                  onImageAdded={onImageAdded}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function usedBy(names: readonly string[]): string {
  if (names.length === 0) return "Not used by any element in this document.";
  return `Used by ${names.join(", ")}.`;
}

function ImagePicker({
  images,
  workspaceId,
  mayUpload,
  onPick,
  onImageAdded,
}: {
  images: readonly ImageAssetView[];
  workspaceId: string | null;
  mayUpload: boolean;
  onPick: (image: ImageAssetView) => void;
  onImageAdded: (image: ImageAssetView) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(chosen: File) {
    if (workspaceId === null) return;
    setBusy(true);
    setRejection(null);
    const { data, error } = await uploadImage({
      path: { workspaceId },
      body: { file: chosen },
    });
    setBusy(false);
    if (data === undefined) {
      setRejection(refusalMessage(error));
      return;
    }
    onImageAdded(data);
    onPick(data);
  }

  return (
    <div className="grid gap-2">
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {images.map((image) => (
            <li key={image.id}>
              <button
                type="button"
                className="aspect-square w-full overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 hover:ring-foreground/40"
                onClick={() => onPick(image)}
              >
                <img
                  src={image.url}
                  alt={image.originalFilename}
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mayUpload && (
        <>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (chosen) void upload(chosen);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy || workspaceId === null}
            onClick={() => file.current?.click()}
          >
            {busy ? "Uploading…" : "Upload image"}
          </Button>
        </>
      )}
      <Problem message={rejection} className="text-xs" />
    </div>
  );
}
