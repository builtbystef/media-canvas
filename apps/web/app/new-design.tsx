"use client";

import { createDocument } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CANVAS_PRESETS, UNTITLED, blankDesign, readDimension } from "../lib/canvas-presets";
import { failedToChangeDocument } from "../lib/failures";
import { editorPath } from "../lib/routes";
import { Problem } from "../components/problem";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function NewDesign({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(canvasWidth: number, canvasHeight: number) {
    setBusy(true);
    setProblem(null);
    const { data, error, response } = await createDocument({
      path: { workspaceId },
      body: {
        kind: "design",
        name: UNTITLED,
        document: blankDesign(canvasWidth, canvasHeight),
      },
    });
    if (error !== undefined || data === undefined) {
      setBusy(false);
      setProblem(failedToChangeDocument(response?.status));
      return;
    }
    router.push(editorPath(data.id));
  }

  function createCustom() {
    const canvasWidth = readDimension(width);
    const canvasHeight = readDimension(height);
    if (canvasWidth === null || canvasHeight === null) {
      setProblem("A custom size is two whole numbers of pixels, each at least 1.");
      return;
    }
    void create(canvasWidth, canvasHeight);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>New design</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New design</DialogTitle>
          <DialogDescription>Pick a size. You can change it later in the editor.</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
          {CANVAS_PRESETS.map((preset) => (
            <li key={preset.name}>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-auto w-full flex-col items-start gap-0.5 py-2"
                onClick={() => void create(preset.width, preset.height)}
              >
                <span className="font-medium">{preset.name}</span>
                <span className="text-xs text-muted-foreground">
                  {preset.width} × {preset.height}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <fieldset className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Custom size</legend>
          <Label htmlFor="custom-width">Width</Label>
          <Input
            id="custom-width"
            className="w-20"
            inputMode="numeric"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          />
          <Label htmlFor="custom-height">Height</Label>
          <Input
            id="custom-height"
            className="w-20"
            inputMode="numeric"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={createCustom}>
            Create
          </Button>
        </fieldset>
        <Problem message={problem} />
      </DialogContent>
    </Dialog>
  );
}
