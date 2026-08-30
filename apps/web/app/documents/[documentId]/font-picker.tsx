"use client";

import { uploadFont, type FontAssetView } from "@media-canvas/api-client";
import { useId, useRef, useState } from "react";
import {
  finishFontUpload,
  fontFaceLabel,
  fontFaceName,
  groupFontsForPicker,
} from "../../../lib/assets";
import { cn } from "../../../lib/utils";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

const FIELD = "mb-2 grid gap-1 text-xs";
const CONTROL = "h-7 w-full min-w-0 text-xs";

type Common<T> = { kind: "same"; value: T } | { kind: "mixed" } | { kind: "none" };

export function FontPicker({
  fonts,
  value,
  workspaceId,
  mayUpload,
  onCommit,
  onFontAdded,
  onHoldFont,
}: {
  fonts: readonly FontAssetView[];
  value: Common<string>;
  workspaceId: string | null;
  mayUpload: boolean;
  onCommit: (fontAssetId: string) => void;
  onFontAdded: (font: FontAssetView) => void;
  onHoldFont: (font: FontAssetView) => Promise<boolean>;
}) {
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (value.kind === "none") return null;

  const groups = groupFontsForPicker(fonts);
  const current = value.kind === "same" ? value.value : "";
  const known = fonts.some((font) => font.id === current);
  const items: Record<string, string> = Object.fromEntries([
    ...fonts.map((font) => [font.id, fontFaceLabel(font)] as const),
    ["", "Mixed"] as const,
    ...(known || current === "" ? [] : [[current, current] as const]),
  ]);

  async function apply(font: FontAssetView) {
    if (!(await onHoldFont(font))) {
      setRejection("The app could not be reached. Check your connection, then try again.");
      return;
    }
    setRejection(null);
    onCommit(font.id);
  }

  async function upload(chosen: File) {
    if (workspaceId === null) return;
    setBusy(true);
    setRejection(null);
    const { data, error } = await uploadFont({
      path: { workspaceId },
      body: { file: chosen },
    });
    const finished = finishFontUpload(data ? { ok: true, font: data } : { ok: false, error });
    setBusy(false);
    if (finished.kind === "rejected") {
      setRejection(finished.message);
      return;
    }
    onFontAdded(finished.font);
    await apply(finished.font);
  }

  return (
    <div className={FIELD}>
      <Label htmlFor={id}>Font</Label>
      <Select
        items={items}
        value={current}
        onValueChange={(next) => {
          if (next === null || next === "") return;
          const font = fonts.find((candidate) => candidate.id === next);
          if (font) void apply(font);
        }}
      >
        <SelectTrigger id={id} size="sm" className={cn(CONTROL, "justify-between")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false} className="min-w-48">
          {value.kind === "mixed" && <SelectItem value="">Mixed</SelectItem>}
          {!known && current !== "" && <SelectItem value={current}>{current}</SelectItem>}
          {groups.map((group) => (
            <SelectGroup key={group.family}>
              <SelectLabel>
                {group.family}
                {group.bundled ? " · bundled" : ""}
              </SelectLabel>
              {group.faces.map((font) => (
                <SelectItem
                  key={font.id}
                  value={font.id}
                  style={{ fontFamily: `"${fontFaceName(font.id)}"` }}
                >
                  {font.subfamily}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {mayUpload && (
        <>
          <input
            ref={file}
            type="file"
            accept=".ttf,.otf"
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
            {busy ? "Uploading…" : "Upload font"}
          </Button>
        </>
      )}
      <Problem message={rejection} className="text-xs" />
    </div>
  );
}
