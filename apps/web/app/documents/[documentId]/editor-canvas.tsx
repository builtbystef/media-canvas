import type { DesignDocument } from "@media-canvas/core";

/**
 * The stage the canvas lands in.
 *
 * A document paints its own background, which is why nothing here follows the
 * theme: light or dark, a 1080×1080 white canvas is white and that size. The
 * compiled preview — the same markup the worker renders — is n5csrl's; until
 * it lands, the stage shows the canvas the document declares and nothing on it.
 */
export function EditorCanvas({
  stored,
  valid,
}: {
  stored: Record<string, unknown>;
  valid: boolean;
}) {
  if (!valid) {
    return (
      <main className="stage">
        <p className="problem" role="alert">
          This document is not a v1 Design Document, so there is nothing to draw.
        </p>
      </main>
    );
  }
  // Past `validateDocument`, the document is a v1 Design Document — the core
  // is the one authority on that, here as everywhere else.
  const { canvas } = stored as unknown as DesignDocument;
  const background = typeof canvas.background === "string" ? canvas.background : "#ffffff";

  return (
    <main className="stage">
      <div
        className="canvas"
        style={{ aspectRatio: `${String(canvas.width)} / ${String(canvas.height)}`, background }}
      />
      <p className="quiet">
        {canvas.width} × {canvas.height}
      </p>
    </main>
  );
}
