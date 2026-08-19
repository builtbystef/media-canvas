"use client";

import type { DesignDocument, Preview } from "@media-canvas/core";
import { createPreview } from "@media-canvas/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadAssets, missingAssets, resolverFor } from "../../../lib/canvas-assets";
import {
  type CanvasView,
  fitZoom,
  readView,
  writeView,
  zoomAt,
  zoomBy,
} from "../../../lib/canvas-view";
import { applyUpdate } from "./mounted-preview";

/**
 * The canvas: the compiled document itself.
 *
 * What is drawn here is the markup the render worker screenshots, from the
 * same core compiler — so anything the editor can show that the compiler
 * cannot express would be a bug. It is mounted into a container React never
 * reconciles, and every later document value reaches that container through
 * the preview's own answer (ADR-0006): one node patched, or one full compile.
 *
 * Zoom is a transform on the wrapper around that markup, never a compile at
 * another scale, so the preview's memo caches survive every zoom change. The
 * canvas clips at its own edge exactly as an exported file does — there is no
 * pasteboard (ADR-0008), and off-canvas elements will be reached through the
 * overlay and the layer list (issue 8919ix).
 */
export function EditorCanvas({
  documentId,
  workspaceId,
  stored,
  valid,
}: {
  documentId: string;
  workspaceId: string | null;
  stored: Record<string, unknown>;
  valid: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const pending = useRef<{ left: number; top: number } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const spaceHeld = useRef(false);
  const remembering = useRef(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const design = valid ? (stored as unknown as DesignDocument) : null;
  const canvas = design?.canvas;

  // Opening the document: everything it references is fetched first, because
  // the compiler asks for font bytes and image sizes as it draws and answers
  // synchronously. Nothing is drawn until all of it is in hand.
  useEffect(() => {
    if (design === null || canvas === undefined) return;
    const workspace = workspaceId;
    if (workspace === null) {
      setProblem("This document's Workspace is not the one this window is in.");
      return;
    }
    let left = false;
    async function open(document: DesignDocument, area: DesignDocument["canvas"]) {
      const library = await loadAssets(workspace!, document);
      if (left) return;
      const missing = missingAssets(document, library);
      if (missing.length > 0) {
        // The panel that names each missing asset and offers to replace it is
        // its own slice (issue ljzbq7); until then, this says what is gone.
        setProblem(`This document cannot be drawn: ${missing.join(", ")} could not be fetched.`);
        return;
      }
      const opened = createPreview(resolverFor(library));
      preview.current = opened;
      if (host.current) applyUpdate(host.current, opened.update(document));
      const remembered = readView(window.localStorage, documentId);
      const view = remembered ?? firstView(area, viewport.current);
      pending.current = { left: view.left, top: view.top };
      setZoom(view.zoom);
    }
    open(design, canvas).catch(() => {
      // Whatever went wrong — the assets could not be fetched, or the compiler
      // refused the document — nothing half-drawn is left standing.
      setProblem("This document could not be opened, so nothing is drawn.");
    });
    return () => {
      left = true;
    };
  }, [design, canvas, workspaceId, documentId]);

  // Every later value of the document reaches the mounted markup here, and
  // never through rendering: one element patched, or one full compile.
  useEffect(() => {
    if (design === null || preview.current === null || host.current === null) return;
    applyUpdate(host.current, preview.current.update(design));
  }, [design]);

  // A zoom moves what is under the cursor, so the scroll it asks for is set
  // once the new size is laid out.
  useLayoutEffect(() => {
    const view = viewport.current;
    if (view === null || pending.current === null) return;
    view.scrollLeft = pending.current.left;
    view.scrollTop = pending.current.top;
    pending.current = null;
  }, [zoom]);

  // Wheel and pinch. The listener is the element's own, because a passive one
  // cannot keep the browser from zooming the page instead of the canvas.
  useEffect(() => {
    const view = viewport.current;
    const shown = zoom;
    if (view === null || shown === null) return;
    function wheeled(event: WheelEvent) {
      // Chromium reports a trackpad pinch as a wheel with ctrl held, so the
      // two gestures are one binding.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const held = host.current?.getBoundingClientRect();
      const around = view!.getBoundingClientRect();
      if (!held) return;
      const next = zoomAt(
        { zoom: shown!, left: view!.scrollLeft, top: view!.scrollTop },
        zoomBy(shown!, event.deltaY),
        { x: event.clientX - around.left, y: event.clientY - around.top },
        { x: held.left - around.left, y: held.top - around.top },
      );
      pending.current = { left: next.left, top: next.top };
      setZoom(next.zoom);
      writeView(window.localStorage, documentId, next);
    }
    view.addEventListener("wheel", wheeled, { passive: false });
    return () => view.removeEventListener("wheel", wheeled);
  }, [zoom, documentId]);

  // Space held turns any pointer into a hand, as the interaction model says.
  useEffect(() => {
    function pressed(event: KeyboardEvent) {
      if (event.code === "Space") spaceHeld.current = true;
    }
    function released(event: KeyboardEvent) {
      if (event.code === "Space") spaceHeld.current = false;
    }
    window.addEventListener("keydown", pressed);
    window.addEventListener("keyup", released);
    return () => {
      window.removeEventListener("keydown", pressed);
      window.removeEventListener("keyup", released);
    };
  }, []);

  if (problem !== null) {
    return (
      <main className="stage">
        <p className="problem" role="alert">
          {problem}
        </p>
      </main>
    );
  }
  if (design === null || canvas === undefined) {
    return (
      <main className="stage">
        <p className="problem" role="alert">
          This document is not a v1 Design Document, so there is nothing to draw.
        </p>
      </main>
    );
  }

  const scale = zoom ?? 1;
  return (
    <main
      className="stage"
      ref={viewport}
      onScroll={() => {
        // Panning fires this every frame; where the view got to is worth
        // remembering once a frame, not once an event.
        if (remembering.current || zoom === null) return;
        remembering.current = true;
        requestAnimationFrame(() => {
          remembering.current = false;
          const view = viewport.current;
          if (view === null) return;
          writeView(window.localStorage, documentId, {
            zoom,
            left: view.scrollLeft,
            top: view.scrollTop,
          });
        });
      }}
      onPointerDown={(event) => {
        if (event.button !== 1 && !(event.button === 0 && spaceHeld.current)) return;
        event.preventDefault();
        panning.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const from = panning.current;
        const view = viewport.current;
        if (from === null || view === null) return;
        view.scrollLeft -= event.clientX - from.x;
        view.scrollTop -= event.clientY - from.y;
        panning.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        if (panning.current === null) return;
        panning.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <div
        className="canvas-frame"
        style={{ width: canvas.width * scale, height: canvas.height * scale }}
      >
        {/* React mounts this container and never looks inside it again. */}
        <div
          className="canvas"
          ref={host}
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${String(scale)})`,
            transformOrigin: "0 0",
            visibility: zoom === null ? "hidden" : "visible",
          }}
        />
      </div>
    </main>
  );
}

/** Where a document lands when this browser remembers nothing about it: the
 *  whole canvas in view, scrolled to its top-left. */
function firstView(canvas: DesignDocument["canvas"], viewport: HTMLElement | null): CanvasView {
  const area = viewport?.getBoundingClientRect();
  return {
    zoom: fitZoom(canvas, { width: area?.width ?? 0, height: area?.height ?? 0 }),
    left: 0,
    top: 0,
  };
}
