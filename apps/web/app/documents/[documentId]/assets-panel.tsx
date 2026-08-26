"use client";

import {
  deleteFont,
  deleteImage,
  uploadFont,
  uploadImage,
  type FontAssetView,
  type ImageAssetView,
} from "@media-canvas/api-client";
import type { DesignDocument } from "@media-canvas/core";
import { Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import {
  countAssetUsages,
  describeAssetDeletion,
  fontFaceLabel,
  fontFaceName,
  fontsForPanel,
} from "../../../lib/assets";
import {
  IMAGE_ASSET_DRAG_TYPE,
  refusalMessage,
  serializeImageAssetDrag,
} from "../../../lib/image-placement";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";

/**
 * The CSS faces the panel and picker paint with. The compiled canvas inlines
 * its own @font-face block and must not share these names.
 */
export function FontFaceStyles({ fonts }: { fonts: readonly FontAssetView[] }) {
  if (fonts.length === 0) return null;
  return (
    <style>
      {fonts
        .map((font) => `@font-face{font-family:"${fontFaceName(font.id)}";src:url("${font.url}")}`)
        .join("")}
    </style>
  );
}

type PendingDelete =
  | { kind: "image"; asset: ImageAssetView }
  | { kind: "font"; asset: FontAssetView };

/**
 * The complete asset surface: images as a thumbnail grid of the full-size
 * addresses, fonts as rows in their own face. Upload and delete live here;
 * a Viewer sees the library and is offered neither.
 */
export function AssetsPanel({
  document,
  fonts,
  images,
  workspaceId,
  mayEdit,
  onFontAdded,
  onImageAdded,
  onFontRemoved,
  onImageRemoved,
}: {
  document: DesignDocument;
  fonts: readonly FontAssetView[];
  images: readonly ImageAssetView[];
  workspaceId: string | null;
  mayEdit: boolean;
  onFontAdded: (font: FontAssetView) => void;
  onImageAdded: (image: ImageAssetView) => void;
  onFontRemoved: (fontId: string) => void;
  onImageRemoved: (imageId: string) => void;
}) {
  const grouped = fontsForPanel(fonts);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageProblem, setImageProblem] = useState<string | null>(null);
  const [fontProblem, setFontProblem] = useState<string | null>(null);

  async function remove() {
    if (pending === null || workspaceId === null) return;
    setBusy(true);
    if (pending.kind === "image") {
      const { error } = await deleteImage({
        path: { workspaceId, imageId: pending.asset.id },
      });
      setBusy(false);
      if (error !== undefined) {
        setImageProblem(refusalMessage(error));
        setPending(null);
        return;
      }
      onImageRemoved(pending.asset.id);
    } else {
      const { error } = await deleteFont({
        path: { workspaceId, fontId: pending.asset.id },
      });
      setBusy(false);
      if (error !== undefined) {
        setFontProblem(refusalMessage(error));
        setPending(null);
        return;
      }
      onFontRemoved(pending.asset.id);
    }
    setPending(null);
  }

  const usage = pending === null ? 0 : countAssetUsages(document, pending.asset.id);
  const pendingName =
    pending === null
      ? ""
      : pending.kind === "image"
        ? pending.asset.originalFilename
        : fontFaceLabel(pending.asset);

  return (
    <aside
      className="mt-3 min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
      aria-label="Assets"
    >
      <h2 className="font-heading mb-2 text-sm font-medium">Assets</h2>

      <section className="mb-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Images</h3>
          {mayEdit && (
            <UploadButton
              accept="image/png,image/jpeg,image/webp"
              label="Upload"
              disabled={workspaceId === null}
              onFile={async (file) => {
                if (workspaceId === null) return;
                setImageProblem(null);
                const { data, error } = await uploadImage({
                  path: { workspaceId },
                  body: { file },
                });
                if (data === undefined) {
                  setImageProblem(refusalMessage(error));
                  return;
                }
                onImageAdded(data);
              }}
            />
          )}
        </div>
        <Problem message={imageProblem} className="mb-1 text-xs" />
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground">No images yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {images.map((image) => (
              <li key={image.id} className="relative">
                <div
                  className="aspect-square overflow-hidden rounded-md bg-muted"
                  draggable={mayEdit}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      IMAGE_ASSET_DRAG_TYPE,
                      serializeImageAssetDrag({
                        id: image.id,
                        width: image.width,
                        height: image.height,
                        url: image.url,
                      }),
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  {/* The full-size address; the browser scales it. Nothing
                      derived is stored. */}
                  <img
                    src={image.url}
                    alt={image.originalFilename}
                    draggable={false}
                    className="size-full object-cover"
                  />
                </div>
                {mayEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-0.5 right-0.5 bg-background/80 text-muted-foreground"
                    aria-label={`Delete ${image.originalFilename}`}
                    onClick={() => setPending({ kind: "image", asset: image })}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Fonts</h3>
          {mayEdit && (
            <UploadButton
              accept=".ttf,.otf"
              label="Upload"
              disabled={workspaceId === null}
              onFile={async (file) => {
                if (workspaceId === null) return;
                setFontProblem(null);
                const { data, error } = await uploadFont({
                  path: { workspaceId },
                  body: { file },
                });
                if (data === undefined) {
                  setFontProblem(refusalMessage(error));
                  return;
                }
                onFontAdded(data);
              }}
            />
          )}
        </div>
        <Problem message={fontProblem} className="mb-1 text-xs" />
        {grouped.bundled.length === 0 && grouped.uploaded.length === 0 ? (
          <p className="text-xs text-muted-foreground">No fonts yet.</p>
        ) : (
          <>
            {grouped.bundled.length > 0 && (
              <FontRows
                heading="Bundled"
                fonts={grouped.bundled}
                mayDelete={false}
                onDelete={() => undefined}
              />
            )}
            {grouped.uploaded.length > 0 && (
              <FontRows
                heading="Uploaded"
                fonts={grouped.uploaded}
                mayDelete={mayEdit}
                onDelete={(font) => setPending({ kind: "font", asset: font })}
              />
            )}
          </>
        )}
      </section>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingName}”?</AlertDialogTitle>
            <AlertDialogDescription>{describeAssetDeletion(usage)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function FontRows({
  heading,
  fonts,
  mayDelete,
  onDelete,
}: {
  heading: string;
  fonts: readonly FontAssetView[];
  mayDelete: boolean;
  onDelete: (font: FontAssetView) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[0.65rem] tracking-wide text-muted-foreground uppercase">{heading}</p>
      <ul>
        {fonts.map((font) => (
          <li key={font.id} className="flex items-center gap-1">
            <span
              className="min-w-0 flex-1 truncate py-0.5 text-xs"
              style={{ fontFamily: `"${fontFaceName(font.id)}"` }}
            >
              {fontFaceLabel(font)}
              {font.bundled ? (
                <span className="ml-1 font-sans text-[0.65rem] text-muted-foreground">bundled</span>
              ) : null}
            </span>
            {mayDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={`Delete ${fontFaceLabel(font)}`}
                onClick={() => onDelete(font)}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UploadButton({
  accept,
  label,
  disabled,
  onFile,
}: {
  accept: string;
  label: string;
  disabled: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!chosen) return;
          setBusy(true);
          void onFile(chosen).finally(() => setBusy(false));
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}
