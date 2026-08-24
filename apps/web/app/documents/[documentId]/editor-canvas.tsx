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
  alignElements,
  distributeElements,
  rotateElements,
  snapBounds,
  snapResizeBounds,
  type ElementBounds,
  type Guide,
} from "../../../lib/placement";
import { applyHandleDrag, type Handle, handlesForSelection } from "../../../lib/resize-scale";
import {
  type Bounds,
  marqueeSelection,
  selectionTarget,
  toggleSelection,
  unionBounds,
} from "../../../lib/selection";
import { Inspector } from "./inspector";
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
      bounds: ElementBounds;
      neighbours: ElementBounds[];
      delta: Point;
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
    }
  | {
      kind: "handle";
      pointerId: number;
      clientX: number;
      clientY: number;
      document: DesignDocument;
      ids: string[];
      handle: Handle;
      bounds: Bounds;
      neighbours: ElementBounds[];
      delta: Point;
      keepAspect: boolean;
      fromCenter: boolean;
    }
  | {
      kind: "rotate";
      pointerId: number;
      document: DesignDocument;
      ids: string[];
      bounds: Map<string, ElementBounds>;
      pivot: Point;
      startAngle: number;
      delta: number;
      snapped: boolean;
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
  const commitInspectorEdit = useStore(store, (state) => state.commitInspectorEdit);
  const commitHandleDrag = useStore(store, (state) => state.commitHandleDrag);
  const commitPlacementEdit = useStore(store, (state) => state.commitPlacementEdit);
  const currentDesign = useRef(design);
  currentDesign.current = design;
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
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
          const rotationNode = (event.target as globalThis.Element).closest?.(".rotation-zone");
          if (rotationNode !== null && selectionBox !== null && selected.length > 0) {
            const pivot = {
              x: (selectionBox.left + selectionBox.right) / 2,
              y: (selectionBox.top + selectionBox.bottom) / 2,
            };
            const point = canvasPoint(event.clientX, event.clientY, canvasSpace.current, zoom);
            gesture.current = {
              kind: "rotate",
              pointerId: event.pointerId,
              document: design,
              ids: selected,
              bounds: mountedBoundsMap(design.elements, host.current, canvasSpace.current, zoom),
              pivot,
              startAngle: angleFrom(pivot, point),
              delta: 0,
              snapped: event.shiftKey,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          const handleNode = (event.target as globalThis.Element).closest?.(".selection-handle");
          const handle = handleNode?.getAttribute("data-handle") as Handle | null;
          if (handle !== null && selectionBox !== null && selected.length > 0) {
            gesture.current = {
              kind: "handle",
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              document: design,
              ids: selected,
              handle,
              bounds: selectionBox,
              neighbours: siblingsAt(design.elements, enteredPath)
                .filter((element) => !selected.includes(element.id))
                .flatMap((element) =>
                  elementBounds(element.id, host.current, canvasSpace.current, zoom),
                )
                .map((bounds) => ({ id: "neighbour", ...bounds })),
              delta: { x: 0, y: 0 },
              keepAspect: event.shiftKey,
              fromCenter: event.altKey,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          const chain = mountedChainAt(event.clientX, event.clientY, host.current);
          const target = selectionTarget(chain, enteredPath, event.metaKey || event.ctrlKey);
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
                bounds: {
                  id: "selection",
                  ...selectionBounds(next, host.current, canvasSpace.current, zoom)!,
                },
                neighbours: siblingsAt(design.elements, enteredPath)
                  .filter((element) => !next.includes(element.id))
                  .flatMap((element) =>
                    elementBounds(element.id, host.current, canvasSpace.current, zoom),
                  )
                  .map((bounds) => ({ id: "neighbour", ...bounds })),
                delta: { x: 0, y: 0 },
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
            const raw = {
              x: (event.clientX - active.clientX) / zoom,
              y: (event.clientY - active.clientY) / zoom,
            };
            const snapping = snapBounds(
              shiftedBounds(active.bounds, raw),
              canvas,
              active.neighbours,
              zoom,
              event.metaKey || event.ctrlKey,
            );
            active.delta = { x: raw.x + snapping.dx, y: raw.y + snapping.dy };
            setGuides(snapping.guides);
            replaceDocument(() =>
              moveElements(active.document, active.ids, active.delta.x, active.delta.y),
            );
          } else if (active.kind === "rotate") {
            const point = canvasPoint(event.clientX, event.clientY, canvasSpace.current, zoom);
            active.delta = angleDelta(active.startAngle, angleFrom(active.pivot, point));
            active.snapped = event.shiftKey;
            replaceDocument(() =>
              rotateElements(
                active.document,
                active.ids,
                active.delta,
                active.bounds,
                active.snapped,
              ),
            );
          } else if (active.kind === "handle") {
            const raw = {
              x: (event.clientX - active.clientX) / zoom,
              y: (event.clientY - active.clientY) / zoom,
            };
            const snapping = snapResizeBounds(
              { id: "selection", ...resizedBounds(active.bounds, active.handle, raw) },
              active.handle,
              canvas,
              active.neighbours,
              zoom,
              event.metaKey || event.ctrlKey,
            );
            active.delta = {
              x: raw.x + snapping.dx,
              y: raw.y + snapping.dy,
            };
            setGuides(snapping.guides);
            active.keepAspect = event.shiftKey;
            active.fromCenter = event.altKey;
            replaceDocument(() =>
              applyHandleDrag(active.document, active.ids, active.handle, active.delta, {
                bounds: active.bounds,
                keepAspect: active.keepAspect,
                fromCenter: active.fromCenter,
              }),
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
          if (active?.pointerId === event.pointerId && active.kind === "move") {
            commitPlacementEdit(
              (document) => moveElements(document, active.ids, active.delta.x, active.delta.y),
              active.ids,
              active.document,
            );
          } else if (active?.pointerId === event.pointerId && active.kind === "rotate") {
            commitPlacementEdit(
              (document) =>
                rotateElements(document, active.ids, active.delta, active.bounds, active.snapped),
              active.ids,
              active.document,
            );
          } else if (active?.pointerId === event.pointerId && active.kind === "handle") {
            commitHandleDrag(
              active.ids,
              active.handle,
              active.delta,
              {
                bounds: active.bounds,
                keepAspect: active.keepAspect,
                fromCenter: active.fromCenter,
              },
              active.document,
            );
          } else if (active?.pointerId === event.pointerId && active.kind === "draw") {
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
          setGuides([]);
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
              {selectionBox && (
                <SelectionBox
                  bounds={selectionBox}
                  handles={handlesForSelection(
                    selected.flatMap((id) => {
                      const element = findElement(design.elements, id);
                      return element === null ? [] : [element];
                    }),
                  )}
                />
              )}
              {guides.map((guide) => (
                <span
                  className={`snap-guide ${guide.axis}`}
                  key={`${guide.axis}:${String(guide.position)}`}
                  style={guide.axis === "x" ? { left: guide.position } : { top: guide.position }}
                />
              ))}
              {marquee && <div className="marquee" style={boxStyle(marquee)} />}
            </div>
          </div>
        </div>
      </main>
      <Inspector
        document={design}
        selected={selected}
        onPreview={replaceDocument}
        onCommit={commitInspectorEdit}
        onAlign={(action) => {
          const bounds = mountedBoundsMap(
            design.elements,
            host.current,
            canvasSpace.current,
            scale,
          );
          commitPlacementEdit(
            (current) => alignElements(current, selected, action, bounds),
            selected,
          );
        }}
        onDistribute={(action) => {
          const bounds = mountedBoundsMap(
            design.elements,
            host.current,
            canvasSpace.current,
            scale,
          );
          commitPlacementEdit(
            (current) => distributeElements(current, selected, action, bounds),
            selected,
          );
        }}
      />
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

function SelectionBox({ bounds, handles }: { bounds: Bounds; handles: readonly Handle[] }) {
  return (
    <div className="selection-box" style={boxStyle(bounds)}>
      {handles.map((handle) => (
        <span className={`selection-handle ${handle}`} data-handle={handle} key={handle} />
      ))}
      {(["top-left", "top-right", "bottom-right", "bottom-left"] as const).map((corner) => (
        <span className={`rotation-zone ${corner}`} key={`rotate-${corner}`} />
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

function selectionBounds(
  ids: readonly string[],
  host: globalThis.Element | null,
  space: globalThis.Element | null,
  zoom: number,
): Bounds | null {
  return unionBounds(ids.flatMap((id) => elementBounds(id, host, space, zoom)));
}

function mountedBoundsMap(
  elements: readonly DocumentElement[],
  host: globalThis.Element | null,
  space: globalThis.Element | null,
  zoom: number,
): Map<string, ElementBounds> {
  return new Map(
    allElements(elements).flatMap((element) => {
      const bounds = elementBounds(element.id, host, space, zoom)[0];
      return bounds ? [[element.id, { id: element.id, ...bounds }] as const] : [];
    }),
  );
}

function allElements(elements: readonly DocumentElement[]): DocumentElement[] {
  return elements.flatMap((element) => [
    element,
    ...(element.type === "group" ? allElements(element.children) : []),
  ]);
}

function resizedBounds(bounds: Bounds, handle: Handle, delta: Point): Bounds {
  return {
    left: handle.includes("left") ? bounds.left + delta.x : bounds.left,
    right: handle.includes("right") ? bounds.right + delta.x : bounds.right,
    top: handle.includes("top") ? bounds.top + delta.y : bounds.top,
    bottom: handle.includes("bottom") ? bounds.bottom + delta.y : bounds.bottom,
  };
}

function shiftedBounds(bounds: ElementBounds, delta: Point): ElementBounds {
  return {
    ...bounds,
    left: bounds.left + delta.x,
    right: bounds.right + delta.x,
    top: bounds.top + delta.y,
    bottom: bounds.bottom + delta.y,
  };
}

function angleFrom(pivot: Point, point: Point): number {
  return (Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180) / Math.PI;
}

function angleDelta(start: number, current: number): number {
  const delta = current - start;
  return ((delta + 540) % 360) - 180;
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
