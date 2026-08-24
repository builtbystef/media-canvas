"use client";

import { useRef } from "react";
import type {
  Border,
  DesignDocument,
  Element,
  Fill,
  GradientStop,
  Shadow,
} from "@media-canvas/core";
import type { AlignAction, DistributeAction } from "../../../lib/placement";
import { normalizeRotation } from "../../../lib/placement";
import {
  addGradientStop,
  commonValue,
  removeGradientStop,
  selectedElements,
  updateCanvas,
  updateGradientStop,
  updateSelectedElements,
} from "../../../lib/inspector-operations";

type Change = (document: DesignDocument) => DesignDocument;
type EditElement = (element: Element) => Element;
type Common<T> = ReturnType<typeof commonValue<T>>;

type InspectorProps = {
  document: DesignDocument;
  selected: readonly string[];
  onPreview: (change: Change) => void;
  onCommit: (change: Change, touched: readonly string[], start?: DesignDocument) => void;
  onAlign: (action: AlignAction) => void;
  onDistribute: (action: DistributeAction) => void;
};

/** The single property surface for the Design Document. Text controls are
 * explicitly Element properties: v1 has no rich spans. */
export function Inspector({
  document,
  selected,
  onPreview,
  onCommit,
  onAlign,
  onDistribute,
}: InspectorProps) {
  const elements = selectedElements(document, selected);
  const commitElements = (edit: EditElement) =>
    onCommit((current) => updateSelectedElements(current, selected, edit), selected);
  const number = (
    label: string,
    read: (element: Element) => number | undefined,
    edit: (element: Element, value: number) => Element,
    options: NumberOptions = {},
  ) => (
    <NumberField
      document={document}
      label={label}
      value={commonValue(elements, read)}
      onPreview={(start, value) =>
        onPreview(() => updateSelectedElements(start, selected, (element) => edit(element, value)))
      }
      onCommit={(start, value) =>
        onCommit(
          () => updateSelectedElements(start, selected, (element) => edit(element, value)),
          selected,
          start,
        )
      }
      {...options}
    />
  );

  if (elements.length === 0) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <h2>Canvas</h2>
        <p className="inspector-note">Canvas properties</p>
        <NumberField
          document={document}
          label="Width"
          value={{ kind: "same", value: document.canvas.width }}
          min={1}
          onPreview={() => undefined}
          onCommit={(start, value) =>
            onCommit(() => updateCanvas(start, { width: value }), [], start)
          }
        />
        <NumberField
          document={document}
          label="Height"
          value={{ kind: "same", value: document.canvas.height }}
          min={1}
          onPreview={() => undefined}
          onCommit={(start, value) =>
            onCommit(() => updateCanvas(start, { height: value }), [], start)
          }
        />
        <FillEditor
          document={document}
          fill={document.canvas.background}
          label="Background"
          onChange={(background) =>
            onCommit((current) => updateCanvas(current, { background }), [])
          }
        />
      </aside>
    );
  }

  const fill = commonValue(elements, fillOf);
  const border = commonValue(elements, borderOf);
  const shadow = commonValue(elements, shadowOf);
  const corners = commonValue(elements, cornerOf);
  const allText = elements.every((element) => element.type === "text");
  const allImages = elements.every((element) => element.type === "image");

  return (
    <aside className="inspector" aria-label="Inspector">
      <AlignmentToolbar count={elements.length} onAlign={onAlign} onDistribute={onDistribute} />
      <h2>Element properties</h2>
      <p className="inspector-note">
        {elements.length === 1 ? elements[0]!.type : `${String(elements.length)} Elements`}
      </p>
      <section>
        <h3>Element</h3>
        <TextField
          label="Name"
          value={commonValue(elements, (element) => element.name ?? "")}
          onCommit={(name) =>
            commitElements((element) => ({ ...element, name: name || undefined }))
          }
        />
        <SelectField
          label="Visible"
          value={commonValue(elements, (element) =>
            typeof element.visible === "boolean" ? String(element.visible) : undefined,
          )}
          options={[
            ["true", "Visible"],
            ["false", "Hidden"],
          ]}
          onCommit={(visible) =>
            commitElements((element) => ({ ...element, visible: visible === "true" }))
          }
        />
        <div className="inspector-grid">
          {number(
            "X",
            (element) => element.x,
            (element, x) => ({ ...element, x }),
          )}
          {number(
            "Y",
            (element) => element.y,
            (element, y) => ({ ...element, y }),
          )}
          {number("Width", widthOf, setWidth, { min: 1 })}
          {number("Height", heightOf, setHeight, { min: 1 })}
          {number(
            "Rotation",
            (element) => normalizeRotation(element.rotation),
            (element, rotation) => ({
              ...element,
              rotation: normalizeRotation(rotation),
            }),
            { step: 0.1, digits: 1 },
          )}
          {number(
            "Opacity",
            (element) => element.opacity,
            (element, opacity) => ({ ...element, opacity }),
            { min: 0, max: 1, step: 0.01 },
          )}
        </div>
      </section>

      {fill.kind !== "none" && (
        <FillEditor
          document={document}
          fill={fill}
          label="Fill"
          onPreview={(start, next) =>
            onPreview(() =>
              updateSelectedElements(start, selected, (element) =>
                hasFill(element) ? { ...element, fill: next } : element,
              ),
            )
          }
          onChange={(next, start) =>
            onCommit(
              (current) =>
                updateSelectedElements(start ?? current, selected, (element) =>
                  hasFill(element) ? { ...element, fill: next } : element,
                ),
              selected,
              start,
            )
          }
        />
      )}

      {elements.every(supportsBorder) && (
        <OptionalPaint
          label="Border"
          enabled={commonValue(elements, (element) => borderOf(element) !== undefined)}
          onToggle={(enabled) =>
            commitElements((element) =>
              supportsBorder(element)
                ? { ...element, border: enabled ? defaultBorder : undefined }
                : element,
            )
          }
        >
          {border.kind === "same" && border.value !== undefined && (
            <>
              <ColorField
                label="Color"
                value={colorValue(border.value.color)}
                onCommit={(color) =>
                  commitElements((element) =>
                    supportsBorder(element) && element.border
                      ? { ...element, border: { ...element.border, color } }
                      : element,
                  )
                }
              />
              {number(
                "Width",
                (element) => borderOf(element)?.width,
                (element, width) =>
                  supportsBorder(element) && element.border
                    ? { ...element, border: { ...element.border, width } }
                    : element,
                { min: 0 },
              )}
            </>
          )}
        </OptionalPaint>
      )}

      {elements.every(supportsShadow) && (
        <OptionalPaint
          label="Shadow"
          enabled={commonValue(elements, (element) => shadowOf(element) !== undefined)}
          onToggle={(enabled) =>
            commitElements((element) =>
              supportsShadow(element)
                ? { ...element, shadow: enabled ? defaultShadow : undefined }
                : element,
            )
          }
        >
          {shadow.kind === "same" && shadow.value !== undefined && (
            <div className="inspector-grid">
              {number("X", (element) => shadowOf(element)?.dx, setShadowNumber("dx"))}
              {number("Y", (element) => shadowOf(element)?.dy, setShadowNumber("dy"))}
              {number("Blur", (element) => shadowOf(element)?.blur, setShadowNumber("blur"), {
                min: 0,
              })}
              {number(
                "Opacity",
                (element) => shadowOf(element)?.opacity,
                setShadowNumber("opacity"),
                { min: 0, max: 1, step: 0.01 },
              )}
              <ColorField
                label="Color"
                value={{ kind: "same", value: shadow.value.color }}
                onCommit={(color) =>
                  commitElements((element) =>
                    supportsShadow(element) && element.shadow
                      ? { ...element, shadow: { ...element.shadow, color } }
                      : element,
                  )
                }
              />
            </div>
          )}
        </OptionalPaint>
      )}

      {corners.kind !== "none" && (
        <section>
          <h3>Corner radius</h3>
          <CornerEditor
            value={corners}
            onCommit={(cornerRadius) =>
              commitElements((element) =>
                supportsCorners(element) ? { ...element, cornerRadius } : element,
              )
            }
          />
        </section>
      )}

      {allText && (
        <section>
          <h3>Typography</h3>
          <p className="inspector-note">Applies to the whole text Element.</p>
          <TextField
            label="Font Asset"
            value={commonValue(elements, (element) =>
              element.type === "text" ? element.fontAssetId : undefined,
            )}
            onCommit={(fontAssetId) =>
              commitElements((element) =>
                element.type === "text" ? { ...element, fontAssetId } : element,
              )
            }
          />
          <div className="inspector-grid">
            {number("Size", textNumber("fontSize"), setTextNumber("fontSize"), { min: 1 })}
            {number("Line height", textNumber("lineHeight"), setTextNumber("lineHeight"), {
              min: 0.01,
              step: 0.01,
            })}
            {number("Spacing", textNumber("letterSpacing"), setTextNumber("letterSpacing"))}
          </div>
          <ColorField
            label="Color"
            value={commonValue(elements, (element) =>
              element.type === "text"
                ? colorValue(element.color).kind === "same"
                  ? (element.color as string)
                  : undefined
                : undefined,
            )}
            onCommit={(color) =>
              commitElements((element) =>
                element.type === "text" ? { ...element, color } : element,
              )
            }
          />
          <SelectField
            label="Alignment"
            value={commonValue(elements, (element) =>
              element.type === "text" ? element.align : undefined,
            )}
            options={[
              ["left", "Left"],
              ["center", "Center"],
              ["right", "Right"],
            ]}
            onCommit={(align) =>
              commitElements((element) =>
                element.type === "text"
                  ? { ...element, align: align as "left" | "center" | "right" }
                  : element,
              )
            }
          />
          <SelectField
            label="Growth anchor"
            value={commonValue(elements, (element) =>
              element.type === "text" ? element.anchor : undefined,
            )}
            options={[
              ["top", "Top"],
              ["middle", "Middle"],
              ["bottom", "Bottom"],
            ]}
            onCommit={(anchor) =>
              commitElements((element) =>
                element.type === "text"
                  ? { ...element, anchor: anchor as "top" | "middle" | "bottom" }
                  : element,
              )
            }
          />
        </section>
      )}

      {allImages && (
        <section>
          <h3>Image</h3>
          <TextField
            label="Image Asset"
            value={commonValue(elements, (element) =>
              element.type === "image" && typeof element.src === "string" ? element.src : undefined,
            )}
            onCommit={(src) =>
              commitElements((element) =>
                element.type === "image" ? { ...element, src } : element,
              )
            }
          />
          <SelectField
            label="Fit mode"
            value={commonValue(elements, (element) =>
              element.type === "image" ? element.fitMode : undefined,
            )}
            options={[
              ["cover", "Cover"],
              ["contain", "Contain"],
              ["stretch", "Stretch"],
            ]}
            onCommit={(fitMode) =>
              commitElements((element) =>
                element.type === "image"
                  ? { ...element, fitMode: fitMode as "cover" | "contain" | "stretch" }
                  : element,
              )
            }
          />
          <SelectField
            label="Clip"
            value={commonValue(elements, (element) =>
              element.type === "image" && typeof element.clip === "string"
                ? element.clip
                : undefined,
            )}
            options={[
              ["none", "None"],
              ["ellipse", "Ellipse"],
            ]}
            onCommit={(clip) =>
              commitElements((element) =>
                element.type === "image"
                  ? { ...element, clip: clip as "none" | "ellipse" }
                  : element,
              )
            }
          />
        </section>
      )}
    </aside>
  );
}

function AlignmentToolbar({
  count,
  onAlign,
  onDistribute,
}: {
  count: number;
  onAlign: (action: AlignAction) => void;
  onDistribute: (action: DistributeAction) => void;
}) {
  const actions: readonly (readonly [AlignAction, string])[] = [
    ["left", "Align left"],
    ["center-horizontal", "Align horizontal centres"],
    ["right", "Align right"],
    ["top", "Align top"],
    ["middle-vertical", "Align vertical middles"],
    ["bottom", "Align bottom"],
  ];
  return (
    <div className="alignment-toolbar" aria-label="Align and distribute" role="toolbar">
      {actions.map(([action, label]) => (
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onAlign(action)}
          key={action}
        >
          {label.replace("Align ", "")}
        </button>
      ))}
      <button type="button" disabled={count < 3} onClick={() => onDistribute("horizontal")}>
        Distribute H
      </button>
      <button type="button" disabled={count < 3} onClick={() => onDistribute("vertical")}>
        Distribute V
      </button>
    </div>
  );
}

type NumberOptions = { min?: number; max?: number; step?: number; digits?: number };

type NumberFieldProps = NumberOptions & {
  document: DesignDocument;
  label: string;
  value: Common<number>;
  onPreview: (start: DesignDocument, value: number) => void;
  onCommit: (start: DesignDocument, value: number) => void;
};

function NumberField({
  document,
  label,
  value,
  onPreview,
  onCommit,
  min,
  max,
  step = 1,
  digits,
}: NumberFieldProps) {
  if (value.kind === "none") return null;
  const shown = value.kind === "same" ? value.value : undefined;
  const clamp = (candidate: number) =>
    Math.max(min ?? -Infinity, Math.min(max ?? Infinity, candidate));
  return (
    <label className="number-field">
      <span
        className="scrub-label"
        onPointerDown={(event) => {
          event.preventDefault();
          const start = document;
          const startX = event.clientX;
          const startValue = shown ?? 0;
          let latest = startValue;
          const move = (moved: PointerEvent) => {
            latest = clamp(startValue + (moved.clientX - startX) * step);
            onPreview(start, latest);
          };
          const finish = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            onCommit(start, latest);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", finish, { once: true });
        }}
        title="Drag to scrub"
      >
        {label}
      </span>
      <input
        key={`${label}:${value.kind}:${String(shown)}`}
        type="number"
        defaultValue={shown === undefined || digits === undefined ? shown : shown.toFixed(digits)}
        placeholder={value.kind === "mixed" ? "Mixed" : undefined}
        min={min}
        max={max}
        step={step}
        onBlur={(event) => {
          const parsed = event.currentTarget.valueAsNumber;
          if (Number.isFinite(parsed)) onCommit(document, clamp(parsed));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: Common<string>;
  onCommit: (value: string) => void;
}) {
  if (value.kind === "none") return null;
  return (
    <label>
      {label}
      <input
        key={`${label}:${value.kind}:${value.kind === "same" ? value.value : ""}`}
        defaultValue={value.kind === "same" ? value.value : undefined}
        placeholder={value.kind === "mixed" ? "Mixed" : undefined}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: Common<string>;
  options: readonly (readonly [string, string])[];
  onCommit: (value: string) => void;
}) {
  if (value.kind === "none") return null;
  return (
    <label>
      {label}
      <select
        value={value.kind === "same" ? value.value : ""}
        onChange={(event) => onCommit(event.currentTarget.value)}
      >
        {value.kind === "mixed" && <option value="">Mixed</option>}
        {options.map(([option, text]) => (
          <option value={option} key={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: Common<string>;
  onCommit: (value: string) => void;
}) {
  if (value.kind === "none") return <p className="inspector-note">{label}: bound to a Variable</p>;
  const color = value.kind === "same" ? value.value.slice(0, 7) : "#000000";
  return (
    <label>
      {label}
      <input
        type="color"
        value={color}
        onChange={(event) => onCommit(event.currentTarget.value.toUpperCase())}
      />
    </label>
  );
}

function FillEditor({
  document,
  fill,
  label,
  onPreview,
  onChange,
}: {
  document: DesignDocument;
  fill: Common<Fill> | Fill | DesignDocument["canvas"]["background"];
  label: string;
  onPreview?: (start: DesignDocument, fill: Fill) => void;
  onChange: (fill: Fill, start?: DesignDocument) => void;
}) {
  const gestureStart = useRef<DesignDocument | null>(null);
  const common: Common<Fill> = isCommon(fill)
    ? fill
    : typeof fill === "object" && fill !== null && "$var" in fill
      ? { kind: "none" }
      : { kind: "same", value: fill as Fill };
  if (common.kind === "none")
    return (
      <section>
        <h3>{label}</h3>
        <p className="inspector-note">Bound to a Variable</p>
      </section>
    );
  const current = common.kind === "same" ? common.value : undefined;
  const mode = typeof current === "string" ? "solid" : (current?.type ?? "");
  return (
    <section>
      <h3>{label}</h3>
      <SelectField
        label="Type"
        value={common.kind === "mixed" ? { kind: "mixed" } : { kind: "same", value: mode }}
        options={[
          ["solid", "Solid"],
          ["linear", "Linear gradient"],
          ["radial", "Radial gradient"],
        ]}
        onCommit={(type) => onChange(defaultFill(type))}
      />
      {typeof current === "string" && (
        <ColorField label="Color" value={{ kind: "same", value: current }} onCommit={onChange} />
      )}
      {typeof current === "object" && current !== null && !("$var" in current) && (
        <>
          <div className="gradient-preview" style={{ background: gradientCss(current) }} />
          {current.type === "linear" && (
            <FillNumber
              document={document}
              label="Angle"
              value={current.angle}
              onPreview={(start, angle) => onPreview?.(start, { ...current, angle })}
              onCommit={(start, angle) => onChange({ ...current, angle }, start)}
            />
          )}
          <div className="gradient-stops">
            {current.stops.map((stop, index) => (
              <div className="gradient-stop" key={index}>
                <input
                  aria-label={`Stop ${String(index + 1)} color`}
                  type="color"
                  value={stop.color.slice(0, 7)}
                  onChange={(event) =>
                    onChange(
                      updateGradientStop(current, index, {
                        color: event.currentTarget.value.toUpperCase(),
                      }),
                    )
                  }
                />
                <input
                  aria-label={`Stop ${String(index + 1)} offset`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={stop.offset}
                  onPointerDown={() => {
                    gestureStart.current = document;
                  }}
                  onInput={(event) =>
                    onPreview?.(
                      gestureStart.current ?? document,
                      updateGradientStop(current, index, {
                        offset: event.currentTarget.valueAsNumber,
                      }),
                    )
                  }
                  onPointerUp={(event) => {
                    onChange(
                      updateGradientStop(current, index, {
                        offset: event.currentTarget.valueAsNumber,
                      }),
                      gestureStart.current ?? document,
                    );
                    gestureStart.current = null;
                  }}
                  onKeyUp={(event) =>
                    onChange(
                      updateGradientStop(current, index, {
                        offset: event.currentTarget.valueAsNumber,
                      }),
                    )
                  }
                />
                <output>{Math.round(stop.offset * 100)}%</output>
                <button
                  type="button"
                  disabled={current.stops.length <= 2}
                  onClick={() => onChange(removeGradientStop(current, index))}
                  aria-label={`Remove stop ${String(index + 1)}`}
                >
                  −
                </button>
              </div>
            ))}
            <button type="button" onClick={() => onChange(addGradientStop(current))}>
              Add stop
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FillNumber({
  document,
  label,
  value,
  onPreview,
  onCommit,
}: {
  document: DesignDocument;
  label: string;
  value: number;
  onPreview: (start: DesignDocument, value: number) => void;
  onCommit: (start: DesignDocument, value: number) => void;
}) {
  return (
    <label className="number-field">
      <span
        className="scrub-label"
        onPointerDown={(event) => {
          event.preventDefault();
          const start = document;
          const startX = event.clientX;
          let latest = value;
          const move = (moved: PointerEvent) => {
            latest = value + moved.clientX - startX;
            onPreview(start, latest);
          };
          const finish = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            onCommit(start, latest);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", finish, { once: true });
        }}
        title="Drag to scrub"
      >
        {label}
      </span>
      <input
        type="number"
        defaultValue={value}
        onBlur={(event) => {
          if (Number.isFinite(event.currentTarget.valueAsNumber))
            onCommit(document, event.currentTarget.valueAsNumber);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function SimpleNumber({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onCommit(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

function OptionalPaint({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: Common<boolean>;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3>{label}</h3>
      <label className="toggle">
        <input
          type="checkbox"
          checked={enabled.kind === "same" && enabled.value}
          ref={(node) => {
            if (node) node.indeterminate = enabled.kind === "mixed";
          }}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        Enabled
      </label>
      {children}
    </section>
  );
}

function CornerEditor({
  value,
  onCommit,
}: {
  value: Common<
    | number
    | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }
    | undefined
  >;
  onCommit: (
    value: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number },
  ) => void;
}) {
  if (value.kind !== "same") return <p className="inspector-note">Mixed</p>;
  const current = value.value ?? 0;
  if (typeof current === "number")
    return (
      <>
        <SimpleNumber label="All corners" value={current} onCommit={onCommit} />
        <button
          type="button"
          onClick={() =>
            onCommit({
              topLeft: current,
              topRight: current,
              bottomRight: current,
              bottomLeft: current,
            })
          }
        >
          Edit separately
        </button>
      </>
    );
  return (
    <div className="inspector-grid">
      {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((corner) => (
        <SimpleNumber
          key={corner}
          label={corner}
          value={current[corner]}
          onCommit={(number) => onCommit({ ...current, [corner]: Math.max(0, number) })}
        />
      ))}
    </div>
  );
}

const defaultBorder: Border = { color: "#000000", width: 1 };
const defaultShadow: Shadow = { dx: 0, dy: 4, blur: 8, color: "#000000", opacity: 0.25 };

function hasFill(
  element: Element,
): element is Extract<Element, { type: "rect" | "ellipse" | "vector" }> {
  return element.type === "rect" || element.type === "ellipse" || element.type === "vector";
}
function fillOf(element: Element): Fill | undefined {
  return hasFill(element) && !isBound(element.fill) ? element.fill : undefined;
}
function supportsBorder(
  element: Element,
): element is Extract<Element, { type: "rect" | "ellipse" | "vector" | "image" }> {
  return (
    element.type === "rect" ||
    element.type === "ellipse" ||
    element.type === "vector" ||
    element.type === "image"
  );
}
function borderOf(element: Element): Border | undefined {
  return supportsBorder(element) ? element.border : undefined;
}
function supportsShadow(element: Element): element is Exclude<Element, { type: "group" }> {
  return element.type !== "group";
}
function shadowOf(element: Element): Shadow | undefined {
  return supportsShadow(element) ? element.shadow : undefined;
}
function supportsCorners(
  element: Element,
): element is Extract<Element, { type: "rect" | "image" }> {
  return element.type === "rect" || element.type === "image";
}
function cornerOf(element: Element) {
  return supportsCorners(element) ? (element.cornerRadius ?? 0) : undefined;
}
function widthOf(element: Element): number | undefined {
  return "width" in element ? element.width : undefined;
}
function heightOf(element: Element): number | undefined {
  return "height" in element ? element.height : undefined;
}
function setWidth(element: Element, width: number): Element {
  return "width" in element ? { ...element, width } : element;
}
function setHeight(element: Element, height: number): Element {
  return "height" in element ? { ...element, height } : element;
}
function isBound(value: unknown): value is { $var: string } {
  return typeof value === "object" && value !== null && "$var" in value;
}
function colorValue(value: string | { $var: string }): Common<string> {
  return typeof value === "string" ? { kind: "same", value } : { kind: "none" };
}
function isCommon(value: unknown): value is Common<Fill> {
  return typeof value === "object" && value !== null && "kind" in value;
}
function defaultFill(type: string): Fill {
  if (type === "linear") return { type: "linear", angle: 90, stops: defaultStops() };
  if (type === "radial") return { type: "radial", stops: defaultStops() };
  return "#000000";
}
function defaultStops(): GradientStop[] {
  return [
    { offset: 0, color: "#000000" },
    { offset: 1, color: "#FFFFFF" },
  ];
}
function gradientCss(fill: Exclude<Fill, string>): string {
  const stops = fill.stops.map((stop) => `${stop.color} ${String(stop.offset * 100)}%`).join(", ");
  return fill.type === "linear"
    ? `linear-gradient(${String(fill.angle + 90)}deg, ${stops})`
    : `radial-gradient(${stops})`;
}
function setShadowNumber(key: keyof Pick<Shadow, "dx" | "dy" | "blur" | "opacity">) {
  return (element: Element, value: number): Element =>
    supportsShadow(element) && element.shadow
      ? { ...element, shadow: { ...element.shadow, [key]: value } }
      : element;
}
function textNumber(key: "fontSize" | "lineHeight" | "letterSpacing") {
  return (element: Element) => (element.type === "text" ? element[key] : undefined);
}
function setTextNumber(key: "fontSize" | "lineHeight" | "letterSpacing") {
  return (element: Element, value: number): Element =>
    element.type === "text" ? { ...element, [key]: value } : element;
}
