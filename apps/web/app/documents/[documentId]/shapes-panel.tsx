"use client";

import {
  PRESET_SHAPE_DRAG_TYPE,
  PRESET_SHAPES,
  serializePresetShapeDrag,
} from "../../../lib/preset-shapes";

export function ShapesPanel({ mayEdit }: { mayEdit: boolean }) {
  return (
    <aside
      className="mt-3 min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
      aria-label="Shapes"
    >
      <h2 className="font-heading mb-2 text-sm font-medium">Shapes</h2>
      <ul className="grid grid-cols-2 gap-1.5">
        {PRESET_SHAPES.map((shape) => (
          <li key={shape.name}>
            <div
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground"
              draggable={mayEdit}
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  PRESET_SHAPE_DRAG_TYPE,
                  serializePresetShapeDrag(shape.name),
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <svg
                aria-hidden
                className="size-8 overflow-visible text-foreground"
                viewBox={`0 0 ${String(shape.viewBox.width)} ${String(shape.viewBox.height)}`}
              >
                <path
                  d={shape.path}
                  fill={shape.border === undefined ? "currentColor" : "none"}
                  stroke={shape.border === undefined ? undefined : "currentColor"}
                  strokeWidth={shape.border?.width}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {shape.label}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
