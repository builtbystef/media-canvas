"use client";

import type { DesignDocument, Element as DocumentElement, Preview } from "@media-canvas/core";
import { createPreview } from "@media-canvas/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { loadAssets, missingAssets, resolverFor } from "../../../lib/canvas-assets";
import {
  type CanvasView,
  fitZoom,
  readView,
  writeView,
  zoomAt,
  zoomBy,
} from "../../../lib/canvas-view";
import {
  moveElements,
  renameElement,
  reorderElement,
  setElementVisibility,
} from "../../../lib/document-operations";
import {
  DEFAULT_FONT_ASSET_ID,
  type DrawTool,
  type Point,
  type Tool,
  createDrawnElement,
  drawingBounds,
  toolForKey,
} from "../../../lib/drawing-tools";
import { createEditorStore } from "../../../lib/editor-store";
import {
  type Bounds,
  marqueeSelection,
  selectionTarget,
  toggleSelection,
  unionBounds,
} from "../../../lib/selection";
import { LayerList } from "./layer-list";
import { applyUpdate } from "./mounted-preview";

type Gesture =
  | {
      kind: "move";
      pointerId: number;
      clientX: number;
      clientY: number;
      document: DesignDocument;
      ids: string[];
    }
  | { kind: "marquee"; pointerId: number; start: Point; current: Point; shifted: boolean }
  | {
      kind: "draw";
      pointerId: number;
      tool: DrawTool;
      start: Point;
      current: Point;
      constrained: boolean;
      fromCenter: boolean;
    };

/** The compiled Design Document, its mounted-markup interactions, overlay, and
 * layer tree. Document edits enter through pure operations so ADR-0006's
 * identity-keyed preview caches remain correct. */
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
  const initial = useRef(valid ? (stored as unknown as DesignDocument) : null);
  const [store] = useState(() => createEditorStore(initial.current));
  const design = useStore(store, (state) => state.document);
  const selected = useStore(store, (state) => state.selected);
  const enteredPath = useStore(store, (state) => state.enteredPath);
  const activeTool = useStore(store, (state) => state.activeTool);
  const editingTextId = useStore(store, (state) => state.editingTextId);
  const replaceDocument = useStore(store, (state) => state.replaceDocument);
  const select = useStore(store, (state) => state.select);
  const armTool = useStore(store, (state) => state.armTool);
  const createElement = useStore(store, (state) => state.createElement);
  const currentDesign = useRef(design);
  currentDesign.current = design;
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvasSpace = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<Preview | null>(null);
  const pending = useRef<{ left: number; top: number } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const remembering = useRef(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canvas = design?.canvas;

  // Opening waits for all assets, then mounts the compiler's SVG once.
  useEffect(() => {
    const document = initial.current;
    if (document === null) return;
    const workspace = workspaceId;
    if (workspace === null) {
      setProblem("This document's Workspace is not the one this window is in.");
      return;
    }
    let left = false;
    async function open() {
      const library = await loadAssets(workspace!, document!, [DEFAULT_FONT_ASSET_ID]);
      if (left) return;
      const missing = [
        ...missingAssets(document!, library),
        ...(library.fonts.has(DEFAULT_FONT_ASSET_ID) ? [] : [DEFAULT_FONT_ASSET_ID]),
      ];
      if (missing.length > 0) {
        setProblem(`This document cannot be drawn: ${missing.join(", ")} could not be fetched.`);
        return;
      }
      const opened = createPreview(resolverFor(library));
      preview.current = opened;
      if (host.current && currentDesign.current) {
        applyUpdate(host.current, opened.update(currentDesign.current));
      }
      const remembered = readView(window.localStorage, documentId);
      const view = remembered ?? firstView(document!.canvas, viewport.current);
      pending.current = { left: view.left, top: view.top };
      setZoom(view.zoom);
    }
    open().catch(() => setProblem("This document could not be opened, so nothing is drawn."));
    return () => {
      left = true;
    };
  }, [workspaceId, documentId]);

  // Later snapshots patch only what their identities say changed.
  useLayoutEffect(() => {
    if (design === null || preview.current === null || host.current === null) return;
    applyUpdate(host.current, preview.current.update(design));
  }, [design]);

  // The overlay reads the mounted markup's real bounds; it never duplicates
  // compiler geometry. Those bounds continue to exist when SVG clipping hides
  // an Element beyond the canvas.
  useLayoutEffect(() => {
    if (zoom === null) return;
    setSelectionBox(
      unionBounds(
        selected.flatMap((id) => elementBounds(id, host.current, canvasSpace.current, zoom)),
      ),
    );
  }, [design, selected, zoom]);

  useLayoutEffect(() => {
    const view = viewport.current;
    if (view === null || pending.current === null) return;
    view.scrollLeft = pending.current.left;
    view.scrollTop = pending.current.top;
    pending.current = null;
  }, [zoom]);

  useEffect(() => {
    const view = viewport.current;
    const shown = zoom;
    if (view === null || shown === null) return;
    function wheeled(event: WheelEvent) {
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

  useLayoutEffect(() => {
    if (editingTextId !== null) textInput.current?.focus();
  }, [editingTextId]);

  useEffect(() => {
    function pressed(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        spaceHeld.current = true;
        return;
      }
      if (event.key === "Escape") {
        if (activeTool !== "select" || editingTextId !== null) {
          gesture.current = null;
          setMarquee(null);
          armTool("select");
        } else if (enteredPath.length === 0) select([]);
        else {
          const exited = enteredPath.at(-1)!;
          select([exited], enteredPath.slice(0, -1));
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const tool = toolForKey(event.key);
      if (tool !== null) armTool(tool);
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
  }, [activeTool, armTool, editingTextId, enteredPath, select]);

  if (problem !== null)
    return (
      <main className="stage">
        <p className="problem" role="alert">
          {problem}
        </p>
      </main>
    );
  if (design === null || canvas === undefined)
    return (
      <main className="stage">
        <p className="problem" role="alert">
          This document is not a v1 Design Document, so there is nothing to draw.
        </p>
      </main>
    );

  const scale = zoom ?? 1;
  return (
    <div className="editor-workspace">
      <div className="editor-left">
        <ToolPalette active={activeTool} onArm={armTool} />
        <LayerList
          document={design}
          selected={selected}
          onSelect={(id, parentPath) => select([id], parentPath)}
          onRename={(id, name) => replaceDocument((current) => renameElement(current, id, name))}
          onVisibility={(id, visible) =>
            replaceDocument((current) => setElementVisibility(current, id, visible))
          }
          onReorder={(path, id, index) =>
            replaceDocument((current) => reorderElement(current, path, id, index))
          }
        />
      </div>
      <main
        className="stage"
        ref={viewport}
        onScroll={() => rememberView(remembering, viewport.current, zoom, documentId)}
        onDoubleClick={(event) => {
          const chain = mountedChainAt(event.clientX, event.clientY, host.current);
          const target = selectionTarget(chain, enteredPath);
          if (target === null || findElement(design.elements, target)?.type !== "group") return;
          const path = [...enteredPath, target];
          const child = selectionTarget(chain, path);
          select(child === null ? [] : [child], path);
        }}
        onPointerDown={(event) => {
          if (
            event.button === 1 ||
            (event.button === 0 && (spaceHeld.current || activeTool === "hand"))
          ) {
            event.preventDefault();
            panning.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          if (event.button !== 0 || zoom === null) return;
          if (activeTool === "text" || activeTool === "rect" || activeTool === "ellipse") {
            const point = canvasPoint(event.clientX, event.clientY, canvasSpace.current, zoom);
            if (point.x < 0 || point.y < 0 || point.x > canvas.width || point.y > canvas.height)
              return;
            gesture.current = {
              kind: "draw",
              pointerId: event.pointerId,
              tool: activeTool,
              start: point,
              current: point,
              constrained: event.shiftKey,
              fromCenter: event.altKey,
            };
            setMarquee(boundsBetween(point, point));
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          const handle = (event.target as globalThis.Element).closest?.(".selection-handle");
          const chain = handle ? [] : mountedChainAt(event.clientX, event.clientY, host.current);
          const target = handle
            ? (selected[0] ?? null)
            : selectionTarget(chain, enteredPath, event.metaKey || event.ctrlKey);
          if (target === null) {
            select([], []);
            const point = canvasPoint(event.clientX, event.clientY, canvasSpace.current, zoom);
            if (
              point.x >= 0 &&
              point.y >= 0 &&
              point.x <= canvas.width &&
              point.y <= canvas.height
            ) {
              gesture.current = {
                kind: "marquee",
                pointerId: event.pointerId,
                start: point,
                current: point,
                shifted: event.shiftKey,
              };
              setMarquee(boundsBetween(point, point));
            }
          } else {
            const next = event.shiftKey
              ? toggleSelection(selected, target)
              : selected.includes(target)
                ? selected
                : [target];
            select(next);
            if (next.length > 0)
              gesture.current = {
                kind: "move",
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                document: design,
                ids: next,
              };
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = panning.current;
          const view = viewport.current;
          if (from !== null && view !== null) {
            view.scrollLeft -= event.clientX - from.x;
            view.scrollTop -= event.clientY - from.y;
            panning.current = { x: event.clientX, y: event.clientY };
            return;
          }
          const active = gesture.current;
          if (active?.pointerId !== event.pointerId || zoom === null) return;
          if (active.kind === "move") {
            replaceDocument(() =>
              moveElements(
                active.document,
                active.ids,
                (event.clientX - active.clientX) / zoom,
                (event.clientY - active.clientY) / zoom,
              ),
            );
          } else {
            active.current = canvasPoint(event.clientX, event.clientY, canvasSpace.current, zoom);
            if (active.kind === "draw") {
              active.constrained = event.shiftKey;
              active.fromCenter = event.altKey;
            }
            setMarquee(
              active.kind === "draw"
                ? drawingBounds(
                    active.start,
                    active.current,
                    active.constrained && active.tool !== "text",
                    active.fromCenter,
                  )
                : boundsBetween(active.start, active.current),
            );
          }
        }}
        onPointerUp={(event) => {
          panning.current = null;
          const active = gesture.current;
          if (active?.pointerId === event.pointerId && active.kind === "draw") {
            createElement(
              createDrawnElement(
                active.tool,
                crypto.randomUUID(),
                active.start,
                active.current,
                active.constrained,
                active.fromCenter,
              ),
            );
          } else if (
            active?.pointerId === event.pointerId &&
            active.kind === "marquee" &&
            zoom !== null
          ) {
            const bounds = boundsBetween(active.start, active.current);
            const ids = siblingsAt(design.elements, enteredPath)
              .map((element) => ({
                id: element.id,
                bounds: elementBounds(element.id, host.current, canvasSpace.current, zoom)[0]!,
              }))
              .filter((candidate) => candidate.bounds !== undefined);
            const found = marqueeSelection(bounds, ids);
            select(active.shifted ? found.reduce(toggleSelection, selected) : found);
          }
          gesture.current = null;
          setMarquee(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <div
          className="canvas-frame"
          style={{ width: canvas.width * scale, height: canvas.height * scale }}
        >
          <div
            className="canvas-space"
            ref={canvasSpace}
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${String(scale)})`,
              transformOrigin: "0 0",
              visibility: zoom === null ? "hidden" : "visible",
            }}
          >
            <div className="canvas" ref={host} />
            <div className="canvas-overlay" aria-hidden="true">
              {selectionBox && <SelectionBox bounds={selectionBox} />}
              {marquee && <div className="marquee" style={boxStyle(marquee)} />}
            </div>
          </div>
        </div>
      </main>
      {editingTextId !== null && (
        <textarea
          aria-label="Text content"
          className="visually-hidden"
          defaultValue=""
          readOnly
          ref={textInput}
        />
      )}
    </div>
  );
}

function ToolPalette({ active, onArm }: { active: Tool; onArm: (tool: Tool) => void }) {
  const tools: readonly { tool: Tool; label: string; key: string }[] = [
    { tool: "select", label: "Select", key: "V" },
    { tool: "text", label: "Text", key: "T" },
    { tool: "rect", label: "Rectangle", key: "R" },
    { tool: "ellipse", label: "Ellipse", key: "O" },
    { tool: "hand", label: "Hand", key: "H" },
  ];
  return (
    <div aria-label="Drawing tools" className="tools" role="toolbar">
      {tools.map(({ tool, label, key }) => (
        <button
          aria-pressed={active === tool}
          key={tool}
          onClick={() => onArm(tool)}
          title={`${label} (${key})`}
          type="button"
        >
          {label}
          <kbd>{key}</kbd>
        </button>
      ))}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function SelectionBox({ bounds }: { bounds: Bounds }) {
  return (
    <div className="selection-box" style={boxStyle(bounds)}>
      {["nw", "ne", "sw", "se"].map((corner) => (
        <span className={`selection-handle ${corner}`} key={corner} />
      ))}
    </div>
  );
}

function boxStyle(bounds: Bounds) {
  return {
    left: bounds.left,
    top: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function mountedChainAt(
  clientX: number,
  clientY: number,
  host: globalThis.Element | null,
): string[] {
  const hit = document.elementFromPoint(clientX, clientY);
  if (hit === null || host === null || !host.contains(hit)) return [];
  const chain: string[] = [];
  for (
    let node: globalThis.Element | null = hit;
    node !== null && node !== host;
    node = node.parentElement
  ) {
    const id = node.getAttribute("data-element");
    if (id !== null) chain.push(id);
  }
  return chain;
}

function elementBounds(
  id: string,
  host: globalThis.Element | null,
  space: globalThis.Element | null,
  zoom: number,
): Bounds[] {
  const node = host?.querySelector(`[data-element="${CSS.escape(id)}"]`);
  if (!node || !space) return [];
  const bounds = node.getBoundingClientRect();
  const origin = space.getBoundingClientRect();
  return [
    {
      left: (bounds.left - origin.left) / zoom,
      top: (bounds.top - origin.top) / zoom,
      right: (bounds.right - origin.left) / zoom,
      bottom: (bounds.bottom - origin.top) / zoom,
    },
  ];
}

function canvasPoint(
  clientX: number,
  clientY: number,
  space: globalThis.Element | null,
  zoom: number,
): Point {
  const origin = space?.getBoundingClientRect();
  return { x: (clientX - (origin?.left ?? 0)) / zoom, y: (clientY - (origin?.top ?? 0)) / zoom };
}

function boundsBetween(a: Point, b: Point): Bounds {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

function findElement(elements: readonly DocumentElement[], id: string): DocumentElement | null {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === "group") {
      const found = findElement(element.children, id);
      if (found) return found;
    }
  }
  return null;
}

function siblingsAt(elements: DocumentElement[], path: readonly string[]): DocumentElement[] {
  let siblings = elements;
  for (const id of path) {
    const group = siblings.find((element) => element.id === id);
    if (group?.type !== "group") return [];
    siblings = group.children;
  }
  return siblings;
}

function rememberView(
  remembering: { current: boolean },
  viewport: HTMLDivElement | null,
  zoom: number | null,
  documentId: string,
) {
  if (remembering.current || zoom === null) return;
  remembering.current = true;
  requestAnimationFrame(() => {
    remembering.current = false;
    if (viewport)
      writeView(window.localStorage, documentId, {
        zoom,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      });
  });
}

function firstView(canvas: DesignDocument["canvas"], viewport: HTMLElement | null): CanvasView {
  const area = viewport?.getBoundingClientRect();
  return {
    zoom: fitZoom(canvas, { width: area?.width ?? 0, height: area?.height ?? 0 }),
    left: 0,
    top: 0,
  };
}
