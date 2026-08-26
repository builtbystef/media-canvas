"use client";

import type {
  DesignDocument,
  Element as DocumentElement,
  Preview,
  TextLayout,
  VariableDecl,
} from "@media-canvas/core";
import { caretRect, createPreview, hitIndex, layoutText } from "@media-canvas/core";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useStore } from "zustand";
import {
  type AssetLibrary,
  loadAssets,
  missingAssets,
  resolverFor,
} from "../../../lib/canvas-assets";
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
import type { EditorStore } from "../../../lib/editor-store";
import {
  alignElements,
  distributeElements,
  rotateElements,
  snapBounds,
  snapResizeBounds,
  type ElementBounds,
  type Guide,
} from "../../../lib/placement";
import {
  applyHandleDrag,
  type Handle,
  handleForPointerTarget,
  handlesForSelection,
} from "../../../lib/resize-scale";
import {
  type Bounds,
  marqueeSelection,
  selectionTarget,
  toggleSelection,
  unionBounds,
} from "../../../lib/selection";
import {
  type TextSelection,
  moveByCharacter,
  moveByLine,
  moveByWord,
  moveToLineBoundary,
  selectWord,
  selectionRects,
} from "../../../lib/text-editing";
import { previewDocument } from "../../../lib/preview-document";
import {
  insertTokenName,
  openTokenQuery,
  tokenSuggestions,
  unknownTokens,
} from "../../../lib/variable-operations";
import { cn } from "../../../lib/utils";
import { Problem } from "../../../components/problem";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group";
import { Inspector } from "./inspector";
import { LayerList } from "./layer-list";
import { applyUpdate } from "./mounted-preview";
import { VariablesPanel } from "./variables-panel";

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
    }
  | { kind: "text-select"; pointerId: number; id: string };

/**
 * The stage is what the canvas is looked at through: it scrolls, and scrolling
 * it is how the canvas is panned. There is no pasteboard around the canvas
 * (ADR-0008) — what falls outside it is clipped, here as in an export.
 */
const STAGE =
  "my-6 h-[min(70vh,42rem)] touch-none overflow-auto overscroll-contain rounded-lg border bg-background p-12";

/** The compiled Design Document, its mounted-markup interactions, overlay, and
 * layer tree. Document edits enter through pure operations so ADR-0006's
 * identity-keyed preview caches remain correct. */
export function EditorCanvas({
  store,
  documentId,
  workspaceId,
  isTemplate,
  mayEdit,
}: {
  store: EditorStore;
  documentId: string;
  workspaceId: string | null;
  isTemplate: boolean;
  mayEdit: boolean;
}) {
  const initial = useRef(store.getState().document);
  const design = useStore(store, (state) => state.document);
  const selected = useStore(store, (state) => state.selected);
  const enteredPath = useStore(store, (state) => state.enteredPath);
  const activeTool = useStore(store, (state) => state.activeTool);
  const editingTextId = useStore(store, (state) => state.editingTextId);
  const replaceDocument = useStore(store, (state) => state.replaceDocument);
  const select = useStore(store, (state) => state.select);
  const armTool = useStore(store, (state) => state.armTool);
  const createElement = useStore(store, (state) => state.createElement);
  const beginTextEdit = useStore(store, (state) => state.beginTextEdit);
  const updateTextContent = useStore(store, (state) => state.updateTextContent);
  const endTextEdit = useStore(store, (state) => state.endTextEdit);
  const commitInspectorEdit = useStore(store, (state) => state.commitInspectorEdit);
  const commitHandleDrag = useStore(store, (state) => state.commitHandleDrag);
  const commitPlacementEdit = useStore(store, (state) => state.commitPlacementEdit);
  const undo = useStore(store, (state) => state.undo);
  const redo = useStore(store, (state) => state.redo);
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
  const library = useRef<AssetLibrary | null>(null);
  const [textSelection, setTextSelection] = useState<TextSelection>({ anchor: 0, focus: 0 });
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
      const assets = await loadAssets(workspace!, document!, [DEFAULT_FONT_ASSET_ID]);
      if (left) return;
      const missing = [
        ...missingAssets(document!, assets),
        ...(assets.fonts.has(DEFAULT_FONT_ASSET_ID) ? [] : [DEFAULT_FONT_ASSET_ID]),
      ];
      if (missing.length > 0) {
        setProblem(`This document cannot be drawn: ${missing.join(", ")} could not be fetched.`);
        return;
      }
      library.current = assets;
      const opened = createPreview(resolverFor(assets));
      preview.current = opened;
      if (host.current && currentDesign.current) {
        applyUpdate(host.current, opened.update(previewDocument(currentDesign.current)));
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
    applyUpdate(host.current, preview.current.update(previewDocument(design, editingTextId)));
  }, [design, editingTextId]);

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
    const node = textInput.current;
    if (editingTextId === null || node === null) return;
    node.focus();
    const start = Math.min(textSelection.anchor, textSelection.focus);
    const end = Math.max(textSelection.anchor, textSelection.focus);
    node.setSelectionRange(start, end);
  }, [editingTextId, textSelection]);

  useEffect(() => {
    function pressed(event: KeyboardEvent) {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        event.preventDefault();
        spaceHeld.current = true;
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key === "Escape") {
        if (activeTool !== "select" || editingTextId !== null) {
          gesture.current = null;
          setMarquee(null);
          if (editingTextId !== null) endTextEdit();
          else armTool("select");
        } else if (enteredPath.length === 0) select([]);
        else {
          const exited = enteredPath.at(-1)!;
          select([exited], enteredPath.slice(0, -1));
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "Enter" && editingTextId === null && selected.length === 1) {
        const id = selected[0]!;
        const element = findElement(currentDesign.current?.elements ?? [], id);
        if (element?.type === "text") {
          event.preventDefault();
          beginTextEdit(id);
          setTextSelection({
            anchor: element.content.length,
            focus: element.content.length,
          });
          return;
        }
      }
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
  }, [
    activeTool,
    armTool,
    beginTextEdit,
    editingTextId,
    endTextEdit,
    enteredPath,
    redo,
    select,
    selected,
    undo,
  ]);

  if (problem !== null)
    return (
      <main className={STAGE}>
        <Problem message={problem} />
      </main>
    );
  if (design === null || canvas === undefined)
    return (
      <main className={STAGE}>
        <Problem message="This document is not a v1 Design Document, so there is nothing to draw." />
      </main>
    );

  const scale = zoom ?? 1;
  return (
    <div className="grid grid-cols-[14rem_minmax(0,1fr)_16rem] gap-4">
      <div className="mt-6 min-w-0">
        <ToolPalette active={activeTool} onArm={armTool} />
        <LayerList
          document={design}
          selected={selected}
          onSelect={(id, parentPath) => select([id], parentPath)}
          onRename={(id, name) =>
            commitInspectorEdit((current) => renameElement(current, id, name), [id])
          }
          onVisibility={(id, visible) =>
            commitInspectorEdit((current) => setElementVisibility(current, id, visible), [id])
          }
          onReorder={(path, id, index) =>
            commitInspectorEdit((current) => reorderElement(current, path, id, index), [id])
          }
        />
        {isTemplate && (
          <VariablesPanel document={design} mayEdit={mayEdit} onCommit={commitInspectorEdit} />
        )}
      </div>
      <main
        className={STAGE}
        ref={viewport}
        onScroll={() => rememberView(remembering, viewport.current, zoom, documentId)}
        onDoubleClick={(event) => {
          const chain = mountedChainAt(event.clientX, event.clientY, host.current);
          const target = selectionTarget(chain, enteredPath);
          const element = target === null ? null : findElement(design.elements, target);
          if (element?.type === "text") {
            beginTextEdit(element.id);
            const layout = layoutOf(element, library.current);
            if (layout !== null) {
              const local = svgLocalPoint(event.clientX, event.clientY, host.current, element.id);
              const index =
                local === null
                  ? hitIndex(layout, { x: element.x, y: element.y })
                  : hitIndex(layout, local);
              setTextSelection(selectWord(element.content, index));
            } else {
              setTextSelection(selectWord(element.content, 0));
            }
            return;
          }
          if (element?.type !== "group") return;
          const path = [...enteredPath, target!];
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
          if (editingTextId !== null) {
            const chain = mountedChainAt(event.clientX, event.clientY, host.current);
            const target = selectionTarget(chain, enteredPath, event.metaKey || event.ctrlKey);
            const editing = findElement(design.elements, editingTextId);
            if (target === editingTextId && editing?.type === "text") {
              const layout = layoutOf(editing, library.current);
              const local = svgLocalPoint(event.clientX, event.clientY, host.current, editing.id);
              const index =
                layout === null ? 0 : hitIndex(layout, local ?? { x: editing.x, y: editing.y });
              setTextSelection(
                event.shiftKey
                  ? { ...textSelection, focus: index }
                  : { anchor: index, focus: index },
              );
              gesture.current = { kind: "text-select", pointerId: event.pointerId, id: editing.id };
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
            endTextEdit();
          }
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
          const rotationNode = (event.target as globalThis.Element).closest?.("[data-rotate]");
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
          const handle = handleForPointerTarget(event.target as globalThis.Element);
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
          if (active.kind === "text-select") {
            const editing = findElement(design.elements, active.id);
            if (editing?.type !== "text") return;
            const layout = layoutOf(editing, library.current);
            if (layout === null) return;
            const local = svgLocalPoint(event.clientX, event.clientY, host.current, editing.id);
            const index = hitIndex(layout, local ?? { x: editing.x, y: editing.y });
            setTextSelection((current) => ({ ...current, focus: index }));
            return;
          }
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
          className="mx-auto"
          style={{ width: canvas.width * scale, height: canvas.height * scale }}
        >
          <div
            className="relative"
            ref={canvasSpace}
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${String(scale)})`,
              transformOrigin: "0 0",
              visibility: zoom === null ? "hidden" : "visible",
            }}
          >
            {/* No token from the theme reaches inside this: the canvas is the
                document's own, and the compiled SVG is the worker's markup.
                Only the shadow it casts on the stage belongs to the app. */}
            <div
              className="shadow-[0_0.25rem_1.5rem_rgb(0_0_0/15%)] dark:shadow-[0_0.25rem_1.5rem_rgb(0_0_0/45%)] [&>svg]:block"
              ref={host}
            />
            <div
              className="pointer-events-none absolute inset-0 overflow-visible"
              aria-hidden="true"
            >
              {selectionBox && editingTextId === null && (
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
              {editingTextId !== null && (
                <TextCaretOverlay
                  element={findElement(design.elements, editingTextId)}
                  layout={layoutOf(findElement(design.elements, editingTextId), library.current)}
                  selection={textSelection}
                  host={host.current}
                  space={canvasSpace.current}
                  zoom={scale}
                />
              )}
              {guides.map((guide) => (
                <span
                  className={cn(
                    "absolute bg-primary",
                    guide.axis === "x" ? "inset-y-0 w-px" : "inset-x-0 h-px",
                  )}
                  key={`${guide.axis}:${String(guide.position)}`}
                  style={guide.axis === "x" ? { left: guide.position } : { top: guide.position }}
                />
              ))}
              {marquee && (
                <div
                  className="absolute border border-primary bg-primary/10"
                  style={boxStyle(marquee)}
                />
              )}
              {isTemplate &&
                [...new Set(unknownTokens(design).flatMap((token) => token.elementIds))].map(
                  (id) => {
                    const bounds = elementBounds(id, host.current, canvasSpace.current, scale)[0];
                    if (bounds === undefined) return null;
                    return (
                      <span
                        className="absolute rounded-sm bg-destructive px-1 text-[0.65rem] leading-4 text-destructive-foreground"
                        key={id}
                        style={{
                          left: bounds.right,
                          top: bounds.top,
                          transform: "translate(-100%, -110%)",
                        }}
                      >
                        Unknown Token
                      </span>
                    );
                  },
                )}
            </div>
            {isTemplate && editingTextId !== null && (
              <TokenAutocomplete
                content={textContentOf(design, editingTextId)}
                cursor={textSelection.focus}
                variables={design.variables ?? []}
                position={caretOverlayPoint(
                  findElement(design.elements, editingTextId),
                  textSelection.focus,
                  library.current,
                  host.current,
                  canvasSpace.current,
                  scale,
                )}
                onPick={(name) => {
                  const inserted = insertTokenName(
                    textContentOf(design, editingTextId),
                    textSelection.focus,
                    name,
                  );
                  updateTextContent(inserted.content);
                  setTextSelection({ anchor: inserted.cursor, focus: inserted.cursor });
                }}
              />
            )}
          </div>
        </div>
      </main>
      <Inspector
        document={design}
        selected={selected}
        isTemplate={isTemplate}
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
          className="sr-only"
          onChange={(event) => {
            updateTextContent(event.currentTarget.value);
            setTextSelection({
              anchor: event.currentTarget.selectionStart,
              focus: event.currentTarget.selectionEnd,
            });
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
              event.preventDefault();
              return;
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
              event.preventDefault();
              setTextSelection({
                anchor: 0,
                focus: textContentOf(design, editingTextId).length,
              });
              return;
            }
            const editing = findElement(design.elements, editingTextId);
            if (editing?.type !== "text") return;
            const layout = layoutOf(editing, library.current);
            const next = textKey(event, editing.content, textSelection, layout);
            if (next === null) return;
            event.preventDefault();
            setTextSelection(next);
          }}
          ref={textInput}
          value={textContentOf(design, editingTextId)}
          wrap="off"
        />
      )}
    </div>
  );
}

function TokenAutocomplete({
  content,
  cursor,
  variables,
  position,
  onPick,
}: {
  content: string;
  cursor: number;
  variables: readonly VariableDecl[];
  position: Point | null;
  onPick: (name: string) => void;
}) {
  const query = openTokenQuery(content, cursor);
  if (query === null || position === null) return null;
  const names = tokenSuggestions(query.query, variables);
  if (names.length === 0) return null;
  return (
    <ul
      className="absolute z-20 min-w-28 rounded-md bg-popover p-1 text-xs shadow-md ring-1 ring-foreground/10"
      role="listbox"
      aria-label="Variables"
      style={{ left: position.x, top: position.y + 4 }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {names.map((name) => (
        <li key={name}>
          <button
            type="button"
            className="block w-full rounded-sm px-2 py-1 text-left hover:bg-accent"
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(name);
            }}
          >
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function caretOverlayPoint(
  element: DocumentElement | null,
  cursor: number,
  assets: AssetLibrary | null,
  host: globalThis.Element | null,
  space: globalThis.Element | null,
  zoom: number,
): Point | null {
  const layout = layoutOf(element, assets);
  if (element?.type !== "text" || layout === null) return null;
  const caret = caretRect(layout, cursor);
  return overlayFromSvg(caret.x, caret.y + caret.height, host, element.id, space, zoom);
}

function ToolPalette({ active, onArm }: { active: Tool; onArm: (tool: Tool) => void }) {
  const tools: readonly { tool: Tool; label: string; key: string }[] = [
    { tool: "select", label: "Select", key: "V" },
    { tool: "text", label: "Text", key: "T" },
    { tool: "rect", label: "Rectangle", key: "R" },
    { tool: "ellipse", label: "Ellipse", key: "O" },
    { tool: "hand", label: "Hand", key: "H" },
  ];
  // Exactly one tool is armed at any moment, and arming is what the group
  // reports — an emptied value is the same tool pressed again, not "no tool".
  return (
    <ToggleGroup
      aria-label="Drawing tools"
      className="grid w-full grid-cols-2"
      value={[active]}
      onValueChange={(value) => {
        const [armed] = value;
        if (armed !== undefined) onArm(armed as Tool);
      }}
    >
      {tools.map(({ tool, label, key }) => (
        <ToggleGroupItem
          key={tool}
          value={tool}
          variant="outline"
          size="sm"
          className="min-w-0 justify-between"
          title={`${label} (${key})`}
        >
          {label}
          <kbd className="font-sans text-muted-foreground">{key}</kbd>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Where each handle sits on the selection's edge, and the rotation zone just
 * outside the corner it belongs to. Both are placed by their own centre.
 *
 * `data-handle` and `data-rotate` are the hit-test contract: pointer-down
 * reads them with `closest`, so a restyle may move these classes freely but
 * must keep the attributes. */
const HANDLE_AT: Record<Handle, string> = {
  "top-left": "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
  top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
  "top-right": "right-0 top-0 translate-x-1/2 -translate-y-1/2",
  right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
  "bottom-right": "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
  bottom: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2",
  "bottom-left": "left-0 bottom-0 -translate-x-1/2 translate-y-1/2",
  left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
};

const ROTATION_AT = {
  "top-left": "left-0 top-0 -translate-x-full -translate-y-full",
  "top-right": "right-0 top-0 translate-x-full -translate-y-full",
  "bottom-right": "right-0 bottom-0 translate-x-full translate-y-full",
  "bottom-left": "left-0 bottom-0 -translate-x-full translate-y-full",
} as const;

function SelectionBox({ bounds, handles }: { bounds: Bounds; handles: readonly Handle[] }) {
  return (
    <div className="absolute border border-primary" style={boxStyle(bounds)}>
      {handles.map((handle) => (
        <span
          className={cn(
            "pointer-events-auto absolute z-2 size-2.5 border border-primary bg-background",
            HANDLE_AT[handle],
          )}
          data-handle={handle}
          key={handle}
        />
      ))}
      {(["top-left", "top-right", "bottom-right", "bottom-left"] as const).map((corner) => (
        <span
          className={cn("pointer-events-auto absolute z-1 size-5 cursor-grab", ROTATION_AT[corner])}
          data-rotate={corner}
          key={`rotate-${corner}`}
        />
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

function textContentOf(document: DesignDocument, id: string): string {
  const element = findElement(document.elements, id);
  return element?.type === "text" ? element.content : "";
}

function layoutOf(element: DocumentElement | null, assets: AssetLibrary | null): TextLayout | null {
  if (element?.type !== "text" || assets === null) return null;
  const bytes = assets.fonts.get(element.fontAssetId);
  return bytes === undefined ? null : layoutText(element, bytes);
}

function svgLocalPoint(
  clientX: number,
  clientY: number,
  host: globalThis.Element | null,
  elementId: string,
): Point | null {
  const svg = host?.querySelector("svg");
  const node = host?.querySelector(`[data-element="${CSS.escape(elementId)}"]`);
  if (!(svg instanceof SVGSVGElement) || !(node instanceof SVGGraphicsElement)) return null;
  const ctm = node.getScreenCTM();
  if (ctm === null) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function overlayFromSvg(
  x: number,
  y: number,
  host: globalThis.Element | null,
  elementId: string,
  space: globalThis.Element | null,
  zoom: number,
): Point {
  const svg = host?.querySelector("svg");
  const node = host?.querySelector(`[data-element="${CSS.escape(elementId)}"]`);
  const origin = space?.getBoundingClientRect();
  if (
    !(svg instanceof SVGSVGElement) ||
    !(node instanceof SVGGraphicsElement) ||
    origin === undefined
  ) {
    return { x, y };
  }
  const ctm = node.getScreenCTM();
  if (ctm === null) return { x, y };
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: (screen.x - origin.left) / zoom, y: (screen.y - origin.top) / zoom };
}

function textKey(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  content: string,
  selection: TextSelection,
  layout: TextLayout | null,
): TextSelection | null {
  const extend = event.shiftKey;
  if (event.key === "ArrowLeft" && event.altKey) return moveByWord(content, selection, -1, extend);
  if (event.key === "ArrowRight" && event.altKey) return moveByWord(content, selection, 1, extend);
  if (event.key === "ArrowLeft" && (event.metaKey || event.ctrlKey) && layout) {
    return moveToLineBoundary(layout, selection, "start", extend);
  }
  if (event.key === "ArrowRight" && (event.metaKey || event.ctrlKey) && layout) {
    return moveToLineBoundary(layout, selection, "end", extend);
  }
  if (event.key === "ArrowLeft") return moveByCharacter(content, selection, -1, extend);
  if (event.key === "ArrowRight") return moveByCharacter(content, selection, 1, extend);
  if (layout === null) return null;
  if (event.key === "ArrowUp") return moveByLine(layout, selection, -1, extend);
  if (event.key === "ArrowDown") return moveByLine(layout, selection, 1, extend);
  if (event.key === "Home") return moveToLineBoundary(layout, selection, "start", extend);
  if (event.key === "End") return moveToLineBoundary(layout, selection, "end", extend);
  return null;
}

function TextCaretOverlay({
  element,
  layout,
  selection,
  host,
  space,
  zoom,
}: {
  element: DocumentElement | null;
  layout: TextLayout | null;
  selection: TextSelection;
  host: globalThis.Element | null;
  space: globalThis.Element | null;
  zoom: number;
}) {
  if (element?.type !== "text" || layout === null) return null;
  const caret = caretRect(layout, selection.focus);
  const origin = overlayFromSvg(caret.x, caret.y, host, element.id, space, zoom);
  const highlights = selectionRects(layout, selection.anchor, selection.focus).map((rect) => {
    const placed = overlayFromSvg(rect.x, rect.y, host, element.id, space, zoom);
    return { ...rect, x: placed.x, y: placed.y };
  });
  return (
    <>
      {highlights.map((rect) => (
        <span
          className="absolute bg-primary/30"
          key={`${String(rect.x)}:${String(rect.y)}`}
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      ))}
      <span
        className="absolute w-px bg-primary"
        style={{
          left: origin.x,
          top: origin.y,
          height: caret.height,
          transform: element.rotation === 0 ? undefined : `rotate(${String(element.rotation)}deg)`,
          transformOrigin: "0 0",
        }}
      />
    </>
  );
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
