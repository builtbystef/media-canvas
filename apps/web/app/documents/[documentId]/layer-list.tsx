"use client";

import type { DesignDocument, Element } from "@media-canvas/core";
import type { DragEvent } from "react";

export function LayerList({
  document,
  selected,
  onSelect,
  onRename,
  onVisibility,
  onReorder,
}: {
  document: DesignDocument;
  selected: readonly string[];
  onSelect: (id: string, parentPath: string[]) => void;
  onRename: (id: string, name: string) => void;
  onVisibility: (id: string, visible: boolean) => void;
  onReorder: (parentPath: string[], id: string, index: number) => void;
}) {
  return (
    <aside className="layers" aria-label="Layers">
      <h2>Layers</h2>
      <ol className="layer-tree">
        <Rows
          elements={document.elements}
          parentPath={[]}
          selected={selected}
          onSelect={onSelect}
          onRename={onRename}
          onVisibility={onVisibility}
          onReorder={onReorder}
        />
      </ol>
    </aside>
  );
}

type RowsProps = Omit<Parameters<typeof LayerList>[0], "document"> & {
  elements: Element[];
  parentPath: string[];
};

function Rows(props: RowsProps) {
  return [...props.elements]
    .map((element, index) => ({ element, index }))
    .reverse()
    .map(({ element, index }) => (
      <li key={element.id}>
        <div
          className="layer-row"
          aria-selected={props.selected.includes(element.id)}
          draggable
          onClick={() => props.onSelect(element.id, props.parentPath)}
          onDragStart={(event) => dragged(event, props.parentPath, element.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropped(event, props.parentPath, index, props.onReorder)}
        >
          <button
            className="visibility"
            type="button"
            aria-label={`${element.visible === false ? "Show" : "Hide"} ${element.name ?? element.type}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onVisibility(element.id, element.visible === false);
            }}
          >
            {element.visible === false ? "○" : "●"}
          </button>
          <input
            aria-label={`Name ${element.type} layer`}
            value={element.name ?? ""}
            placeholder={element.type}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => props.onRename(element.id, event.target.value)}
          />
        </div>
        {element.type === "group" && (
          <ol>
            <Rows
              {...props}
              elements={element.children}
              parentPath={[...props.parentPath, element.id]}
            />
          </ol>
        )}
      </li>
    ));
}

const LAYER_MIME = "application/x-media-canvas-layer";

function dragged(event: DragEvent, parentPath: string[], id: string) {
  event.dataTransfer.setData(LAYER_MIME, JSON.stringify({ parentPath, id }));
  event.dataTransfer.effectAllowed = "move";
}

function dropped(
  event: DragEvent,
  parentPath: string[],
  index: number,
  reorder: (parentPath: string[], id: string, index: number) => void,
) {
  event.preventDefault();
  try {
    const value = JSON.parse(event.dataTransfer.getData(LAYER_MIME)) as {
      parentPath?: unknown;
      id?: unknown;
    };
    if (
      typeof value.id === "string" &&
      Array.isArray(value.parentPath) &&
      value.parentPath.every((part) => typeof part === "string") &&
      value.parentPath.join("/") === parentPath.join("/")
    ) {
      reorder(parentPath, value.id, index);
    }
  } catch {
    // Foreign drag data is not a layer operation.
  }
}
