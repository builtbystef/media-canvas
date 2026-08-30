"use client";

import type { DesignDocument, Element } from "@media-canvas/core";
import type { DragEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { unknownTokens } from "../../../lib/variable-operations";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

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
  const unknownIds = new Set(unknownTokens(document).flatMap((token) => token.elementIds));
  return (
    <aside
      className="mt-3 min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
      aria-label="Layers"
    >
      <h2 className="font-heading mb-2 text-sm font-medium">Layers</h2>
      <ol>
        <Rows
          elements={document.elements}
          parentPath={[]}
          selected={selected}
          unknownIds={unknownIds}
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
  unknownIds: ReadonlySet<string>;
};

function Rows(props: RowsProps) {
  return [...props.elements]
    .map((element, index) => ({ element, index }))
    .reverse()
    .map(({ element, index }) => (
      <li key={element.id}>
        <div
          className="flex items-center gap-1 rounded-md aria-selected:bg-accent aria-selected:text-accent-foreground"
          aria-selected={props.selected.includes(element.id)}
          draggable
          onClick={() => props.onSelect(element.id, props.parentPath)}
          onDragStart={(event) => dragged(event, props.parentPath, element.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropped(event, props.parentPath, index, props.onReorder)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`${element.visible === false ? "Show" : "Hide"} ${element.name ?? element.type}`}
            onClick={(event) => {
              event.stopPropagation();
              if (typeof element.visible === "object") return;
              props.onVisibility(element.id, element.visible === false);
            }}
          >
            {element.visible === false ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
          <Input
            className="h-6 border-transparent bg-transparent px-1 text-xs dark:bg-transparent"
            aria-label={`Name ${element.type} layer`}
            value={element.name ?? ""}
            placeholder={element.type}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => props.onRename(element.id, event.target.value)}
          />
          {props.unknownIds.has(element.id) && (
            <span className="shrink-0 rounded-sm bg-destructive/15 px-1 text-[0.65rem] text-destructive">
              Unknown Token
            </span>
          )}
        </div>
        {element.type === "group" && (
          <ol className="pl-3">
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
  } catch {}
}
