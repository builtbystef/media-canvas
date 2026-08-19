"use client";

import { createDocument } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CANVAS_PRESETS, UNTITLED, blankDesign, readDimension } from "../lib/canvas-presets";
import { failedToChangeDocument } from "../lib/failures";
import { editorPath } from "../lib/routes";

/**
 * Where a document comes from.
 *
 * Creating is the only way one is born, and this dialog is the only way of
 * creating: a preset or a size typed by hand, and then the editor. Nothing is
 * chosen but the canvas — the design itself starts white and empty.
 */
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

  if (!open) {
    return (
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        New design
      </button>
    );
  }

  return (
    <>
      <button type="button" className="primary" disabled>
        New design
      </button>
      <div className="veil" role="presentation" onClick={() => setOpen(false)}>
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-design-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="new-design-title">New design</h2>
          <p className="lead">Pick a size. You can change it later in the editor.</p>
          <ul className="presets">
            {CANVAS_PRESETS.map((preset) => (
              <li key={preset.name}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void create(preset.width, preset.height)}
                >
                  <strong>{preset.name}</strong>
                  <span className="quiet">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <fieldset className="custom">
            <legend>Custom size</legend>
            <label htmlFor="custom-width">Width</label>
            <input
              id="custom-width"
              inputMode="numeric"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
            <label htmlFor="custom-height">Height</label>
            <input
              id="custom-height"
              inputMode="numeric"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
            <button type="button" disabled={busy} onClick={createCustom}>
              Create
            </button>
          </fieldset>
          <p className="problem" role="alert">
            {problem}
          </p>
          <p className="choices">
            <button type="button" className="plain" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
