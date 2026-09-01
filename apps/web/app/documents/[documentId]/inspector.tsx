"use client";

import { useId, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from "lucide-react";
import type { FontAssetView } from "@media-canvas/api-client";
import type {
  Border,
  DesignDocument,
  Element,
  Fill,
  GradientStop,
  Shadow,
  VariableType,
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
import {
  type BindSite,
  bindNewVariable,
  bindProperty,
  convertTextToVariable,
  suggestedVariableName,
  unbindProperty,
} from "../../../lib/variable-operations";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";
import { BindControl } from "./bind-control";
import { FontPicker } from "./font-picker";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Slider } from "../../../components/ui/slider";

const PANEL =
  "scrollbar-slim mt-6 max-h-[min(70vh,42rem)] min-w-0 overflow-auto rounded-lg bg-card p-3 ring-1 ring-foreground/10 max-lg:order-3 max-lg:mt-0";
const SECTION = "border-t py-3";
const HEADING = "font-heading text-sm font-medium";
const NOTE = "text-xs text-muted-foreground";
const PAIR = "grid grid-cols-2 gap-x-1.5";
const FIELD = "mb-2 grid gap-1 text-xs";
const SCRUB = "cursor-ew-resize select-none";
const CONTROL = "h-7 w-full min-w-0 text-xs";
const SWATCH = "px-1 py-1";

type Change = (document: DesignDocument) => DesignDocument;
type EditElement = (element: Element) => Element;
type Common<T> = ReturnType<typeof commonValue<T>>;

type InspectorProps = {
  document: DesignDocument;
  selected: readonly string[];
  isTemplate?: boolean;
  fonts?: readonly FontAssetView[];
  workspaceId?: string | null;
  mayUpload?: boolean;
  onPreview: (change: Change) => void;
  onCommit: (change: Change, touched: readonly string[], start?: DesignDocument) => void;
  onAlign: (action: AlignAction) => void;
  onDistribute: (action: DistributeAction) => void;
  onFontAdded?: (font: FontAssetView) => void;
  onHoldFont?: (font: FontAssetView) => Promise<boolean>;
};

export function Inspector({
  document,
  selected,
  isTemplate = false,
  fonts = [],
  workspaceId = null,
  mayUpload = false,
  onPreview,
  onCommit,
  onAlign,
  onDistribute,
  onFontAdded,
  onHoldFont,
}: InspectorProps) {
  const elements = selectedElements(document, selected);
  const bind = (site: BindSite["site"], name: string) =>
    onCommit((current) => bindSites(current, selected, site, name), selected);
  const unbind = (site: BindSite["site"]) =>
    onCommit((current) => unbindSites(current, selected, site), selected);
  const createBind = (site: BindSite["site"], name: string) =>
    onCommit((current) => {
      const created = createBindSites(current, selected, site, name);
      return created.ok ? created.document : current;
    }, selected);
  const bindable = (
    type: VariableType,
    value: unknown,
    site: BindSite["site"],
    child: React.ReactNode,
    label?: string,
  ) =>
    isTemplate ? (
      <Bindable
        document={document}
        type={type}
        bound={boundName(value)}
        label={label}
        onBind={(name) => bind(site, name)}
        onUnbind={() => unbind(site)}
        onCreate={(name) => createBind(site, name)}
      >
        {child}
      </Bindable>
    ) : (
      child
    );
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
      <aside className={PANEL} aria-label="Inspector">
        <h2 className={HEADING}>Canvas</h2>
        <p className={cn(NOTE, "mb-2")}>Canvas properties</p>
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
        {boundName(document.canvas.background) !== undefined ? (
          <section className={SECTION}>
            <h3 className={cn(HEADING, "mb-2")}>Background</h3>
            {bindable("color", document.canvas.background, "background", null)}
          </section>
        ) : isSolidColorSite(document.canvas.background) ? (
          bindable(
            "color",
            document.canvas.background,
            "background",
            <FillEditor
              document={document}
              fill={document.canvas.background}
              label="Background"
              onChange={(background) =>
                onCommit((current) => updateCanvas(current, { background }), [])
              }
            />,
          )
        ) : (
          <FillEditor
            document={document}
            fill={document.canvas.background}
            label="Background"
            onChange={(background) =>
              onCommit((current) => updateCanvas(current, { background }), [])
            }
          />
        )}
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
    <aside className={PANEL} aria-label="Inspector">
      <AlignmentToolbar count={elements.length} onAlign={onAlign} onDistribute={onDistribute} />
      <h2 className={HEADING}>Element properties</h2>
      <p className={NOTE}>
        {elements.length === 1 ? elements[0]!.type : `${String(elements.length)} Elements`}
      </p>
      <section className={SECTION}>
        <h3 className={cn(HEADING, "mb-2")}>Element</h3>
        <TextField
          label="Name"
          value={commonValue(elements, (element) => element.name ?? "")}
          onCommit={(name) =>
            commitElements((element) => ({ ...element, name: name || undefined }))
          }
        />
        {bindable(
          "boolean",
          commonBound(elements, (element) => element.visible),
          "visible",
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
          />,
          "Visible",
        )}
        <div className={PAIR}>
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

      {(() => {
        const fillBound = commonBound(elements, fillOfBound);
        const fillEditor = (
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
        );
        if (boundName(fillBound) !== undefined) {
          return (
            <section className={SECTION}>
              <h3 className={cn(HEADING, "mb-2")}>Fill</h3>
              {bindable("color", fillBound, "fill", null)}
            </section>
          );
        }
        if (fill.kind === "none") return null;
        if (fill.kind === "same" && typeof fill.value === "string") {
          return bindable("color", fill.value, "fill", fillEditor);
        }
        return fillEditor;
      })()}

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
              {bindable(
                "color",
                border.value.color,
                "borderColor",
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
                />,
                "Color",
              )}
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
            <div className={PAIR}>
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
        <section className={SECTION}>
          <h3 className={cn(HEADING, "mb-2")}>Corner radius</h3>
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
        <TextContentEditor
          key={selected.join(",")}
          elements={elements}
          selected={selected}
          isTemplate={isTemplate}
          onCommit={onCommit}
        />
      )}

      {allText && (
        <section className={SECTION}>
          <h3 className={cn(HEADING, "mb-2")}>Typography</h3>
          <p className={NOTE}>Applies to the whole text Element.</p>
          <FontPicker
            fonts={fonts}
            value={commonValue(elements, (element) =>
              element.type === "text" ? element.fontAssetId : undefined,
            )}
            workspaceId={workspaceId}
            mayUpload={mayUpload}
            onCommit={(fontAssetId) =>
              commitElements((element) =>
                element.type === "text" ? { ...element, fontAssetId } : element,
              )
            }
            onFontAdded={onFontAdded ?? (() => undefined)}
            onHoldFont={onHoldFont ?? (async () => true)}
          />
          <div className={PAIR}>
            {number("Size", textNumber("fontSize"), setTextNumber("fontSize"), { min: 1 })}
            {number("Line height", textNumber("lineHeight"), setTextNumber("lineHeight"), {
              min: 0.01,
              step: 0.01,
            })}
            {number("Spacing", textNumber("letterSpacing"), setTextNumber("letterSpacing"))}
          </div>
          {bindable(
            "color",
            commonBound(elements, (element) =>
              element.type === "text" ? element.color : undefined,
            ),
            "textColor",
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
            />,
            "Color",
          )}
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
        <section className={SECTION}>
          <h3 className={cn(HEADING, "mb-2")}>Image</h3>
          {bindable(
            "image",
            commonBound(elements, (element) =>
              element.type === "image" ? element.src : undefined,
            ),
            "imageSrc",
            <TextField
              label="Image Asset"
              value={commonValue(elements, (element) =>
                element.type === "image" && typeof element.src === "string"
                  ? element.src
                  : undefined,
              )}
              onCommit={(src) =>
                commitElements((element) =>
                  element.type === "image" ? { ...element, src } : element,
                )
              }
            />,
            "Image Asset",
          )}
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
  const actions: readonly (readonly [AlignAction, string, LucideIcon])[] = [
    ["left", "Align left", AlignStartVertical],
    ["center-horizontal", "Align horizontal centres", AlignCenterVertical],
    ["right", "Align right", AlignEndVertical],
    ["top", "Align top", AlignStartHorizontal],
    ["middle-vertical", "Align vertical middles", AlignCenterHorizontal],
    ["bottom", "Align bottom", AlignEndHorizontal],
  ];
  return (
    <div className="mb-3 flex flex-wrap gap-1" aria-label="Align and distribute" role="toolbar">
      {actions.map(([action, label, Icon]) => (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title={label}
          aria-label={label}
          onClick={() => onAlign(action)}
          key={action}
        >
          <Icon />
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        title="Distribute horizontally"
        aria-label="Distribute horizontally"
        disabled={count < 3}
        onClick={() => onDistribute("horizontal")}
      >
        <AlignHorizontalDistributeCenter />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        title="Distribute vertically"
        aria-label="Distribute vertically"
        disabled={count < 3}
        onClick={() => onDistribute("vertical")}
      >
        <AlignVerticalDistributeCenter />
      </Button>
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
    <Label className={FIELD}>
      <span
        className={SCRUB}
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
      <Input
        className={CONTROL}
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
    </Label>
  );
}

function TextContentEditor({
  elements,
  selected,
  isTemplate,
  onCommit,
}: {
  elements: readonly Element[];
  selected: readonly string[];
  isTemplate: boolean;
  onCommit: (change: Change, touched: readonly string[]) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const value = commonValue(elements, (element) =>
    element.type === "text" ? element.content : undefined,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [name, setName] = useState(() =>
    value.kind === "same" ? suggestedVariableName(value.value) : "",
  );
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [error, setError] = useState<string | null>(null);
  if (value.kind === "none") return null;
  const shown = draft ?? (value.kind === "same" ? value.value : "");

  function rememberRange(node: HTMLTextAreaElement) {
    const start = node.selectionStart;
    const end = node.selectionEnd;
    setRange({ start, end });
    const selectedText = start === end ? node.value : node.value.slice(start, end);
    setName(suggestedVariableName(selectedText));
  }

  function commitContent(content: string) {
    onCommit(
      (current) =>
        updateSelectedElements(current, selected, (element) =>
          element.type === "text" ? { ...element, content } : element,
        ),
      selected,
    );
  }

  function convert() {
    const node = field.current;
    const content = node?.value ?? shown;
    const start = range.start;
    const end = range.end;
    const nextName = name.trim();
    let failed: "invalid_name" | "collision" | null = null;
    onCommit((current) => {
      const withContent = updateSelectedElements(current, selected, (element) =>
        element.type === "text" ? { ...element, content } : element,
      );
      const converted = convertTextToVariable(withContent, selected, nextName, { start, end });
      if (!converted.ok) {
        failed = converted.reason;
        return current;
      }
      return converted.document;
    }, selected);
    if (failed !== null) {
      setError(
        failed === "collision"
          ? "A Variable with that name already exists."
          : "Names start with a letter, then letters, digits or underscores.",
      );
      return;
    }
    setError(null);
    setDraft(null);
  }

  return (
    <section className={SECTION}>
      <h3 className={cn(HEADING, "mb-2")}>Content</h3>
      <Label className={FIELD}>
        Text
        <textarea
          ref={field}
          className="min-h-16 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          value={shown}
          placeholder={value.kind === "mixed" ? "Mixed" : undefined}
          spellCheck={false}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            commitContent(event.currentTarget.value);
            setDraft(null);
          }}
          onKeyUp={(event) => rememberRange(event.currentTarget)}
          onMouseUp={(event) => rememberRange(event.currentTarget)}
        />
      </Label>
      {isTemplate && value.kind === "same" && (
        <div className="mt-2 grid gap-1.5">
          <Input
            className={CONTROL}
            aria-label="New Variable name"
            value={name}
            placeholder="Variable name"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                convert();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={name.trim() === ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={convert}
          >
            Convert to Variable
          </Button>
          {error !== null && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </section>
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
    <Label className={FIELD}>
      {label}
      <Input
        className={CONTROL}
        key={`${label}:${value.kind}:${value.kind === "same" ? value.value : ""}`}
        defaultValue={value.kind === "same" ? value.value : undefined}
        placeholder={value.kind === "mixed" ? "Mixed" : undefined}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </Label>
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
  const id = useId();
  if (value.kind === "none") return null;
  const items = Object.fromEntries([...options, ["", "Mixed"] as const]);
  return (
    <div className={FIELD}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value.kind === "same" ? value.value : ""}
        onValueChange={(next) => {
          if (next !== null) onCommit(next);
        }}
      >
        <SelectTrigger id={id} size="sm" className={cn(CONTROL, "justify-between")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {value.kind === "mixed" && <SelectItem value="">Mixed</SelectItem>}
          {options.map(([option, text]) => (
            <SelectItem value={option} key={option}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
  if (value.kind === "none") return <p className={NOTE}>{label}: bound to a Variable</p>;
  const color = value.kind === "same" ? value.value.slice(0, 7) : "#000000";
  return (
    <Label className={FIELD}>
      {label}
      <Input
        className={cn(CONTROL, SWATCH)}
        type="color"
        value={color}
        onChange={(event) => onCommit(event.currentTarget.value.toUpperCase())}
      />
    </Label>
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
      <section className={SECTION}>
        <h3 className={cn(HEADING, "mb-2")}>{label}</h3>
        <p className={NOTE}>Bound to a Variable</p>
      </section>
    );
  const current = common.kind === "same" ? common.value : undefined;
  const mode = typeof current === "string" ? "solid" : (current?.type ?? "");
  return (
    <section className={SECTION}>
      <h3 className={cn(HEADING, "mb-2")}>{label}</h3>
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
          <div
            className="mb-2 h-8 rounded-md border"
            style={{ background: gradientCss(current) }}
          />
          {current.type === "linear" && (
            <FillNumber
              document={document}
              label="Angle"
              value={current.angle}
              onPreview={(start, angle) => onPreview?.(start, { ...current, angle })}
              onCommit={(start, angle) => onChange({ ...current, angle }, start)}
            />
          )}
          <div className="grid gap-1.5">
            {current.stops.map((stop, index) => (
              <div
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-1.5"
                key={index}
              >
                <Input
                  className={cn(CONTROL, SWATCH, "w-8")}
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
                <Slider
                  aria-label={`Stop ${String(index + 1)} offset`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={stop.offset}
                  onValueChange={(next) => {
                    gestureStart.current ??= document;
                    onPreview?.(
                      gestureStart.current,
                      updateGradientStop(current, index, { offset: next as number }),
                    );
                  }}
                  onValueCommitted={(next) => {
                    onChange(
                      updateGradientStop(current, index, { offset: next as number }),
                      gestureStart.current ?? document,
                    );
                    gestureStart.current = null;
                  }}
                />
                <output className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(stop.offset * 100)}%
                </output>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={current.stops.length <= 2}
                  onClick={() => onChange(removeGradientStop(current, index))}
                  aria-label={`Remove stop ${String(index + 1)}`}
                >
                  −
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onChange(addGradientStop(current))}
            >
              Add stop
            </Button>
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
    <Label className={FIELD}>
      <span
        className={SCRUB}
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
      <Input
        className={CONTROL}
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
    </Label>
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
    <Label className={FIELD}>
      {label}
      <Input
        className={CONTROL}
        key={String(value)}
        type="number"
        defaultValue={value}
        onBlur={(event) => {
          if (Number.isFinite(event.currentTarget.valueAsNumber))
            onCommit(event.currentTarget.valueAsNumber);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </Label>
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
    <section className={SECTION}>
      <h3 className={cn(HEADING, "mb-2")}>{label}</h3>
      <Label className="mb-2">
        <Checkbox
          checked={enabled.kind === "same" && enabled.value}
          indeterminate={enabled.kind === "mixed"}
          onCheckedChange={(checked) => onToggle(checked)}
        />
        Enabled
      </Label>
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
  if (value.kind !== "same") return <p className={NOTE}>Mixed</p>;
  const current = value.value ?? 0;
  if (typeof current === "number")
    return (
      <>
        <SimpleNumber label="All corners" value={current} onCommit={onCommit} />
        <Button
          type="button"
          variant="outline"
          size="xs"
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
        </Button>
      </>
    );
  return (
    <div className={PAIR}>
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

function Bindable({
  document,
  type,
  bound,
  label,
  onBind,
  onUnbind,
  onCreate,
  children,
}: {
  document: DesignDocument;
  type: VariableType;
  bound: string | undefined;
  label?: string;
  onBind: (name: string) => void;
  onUnbind: () => void;
  onCreate: (name: string) => void;
  children: React.ReactNode;
}) {
  const control = (
    <BindControl
      document={document}
      type={type}
      bound={bound}
      onBind={onBind}
      onUnbind={onUnbind}
      onCreate={onCreate}
    />
  );
  if (bound !== undefined) {
    return (
      <div className="mb-2 grid gap-1">
        {label !== undefined && <span className="text-xs">{label}</span>}
        {control}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1">
      <div className="min-w-0">{children}</div>
      {control}
    </div>
  );
}

function bindSites(
  document: DesignDocument,
  ids: readonly string[],
  site: BindSite["site"],
  name: string,
): DesignDocument {
  if (site === "background" || ids.length === 0) {
    return bindProperty(document, { site: "background" }, name);
  }
  return ids.reduce(
    (current, elementId) => bindProperty(current, { site, elementId } as BindSite, name),
    document,
  );
}

function unbindSites(
  document: DesignDocument,
  ids: readonly string[],
  site: BindSite["site"],
): DesignDocument {
  if (site === "background" || ids.length === 0) {
    return unbindProperty(document, { site: "background" });
  }
  return ids.reduce(
    (current, elementId) => unbindProperty(current, { site, elementId } as BindSite),
    document,
  );
}

function createBindSites(
  document: DesignDocument,
  ids: readonly string[],
  site: BindSite["site"],
  name: string,
) {
  const first: BindSite =
    site === "background" || ids[0] === undefined
      ? { site: "background" }
      : ({ site, elementId: ids[0] } as BindSite);
  const created = bindNewVariable(document, first, name);
  if (!created.ok || site === "background" || ids.length <= 1) return created;
  return {
    ok: true as const,
    document: ids
      .slice(1)
      .reduce(
        (current, elementId) => bindProperty(current, { site, elementId } as BindSite, name),
        created.document,
      ),
  };
}

function commonBound(elements: readonly Element[], read: (element: Element) => unknown): unknown {
  if (elements.length === 0) return undefined;
  const first = read(elements[0]!);
  return elements.every((element) => JSON.stringify(read(element)) === JSON.stringify(first))
    ? first
    : undefined;
}

function boundName(value: unknown): string | undefined {
  return isBound(value) ? value.$var : undefined;
}

function fillOfBound(element: Element): unknown {
  return hasFill(element) ? element.fill : undefined;
}

function isSolidColorSite(value: unknown): boolean {
  return typeof value === "string" || isBound(value);
}

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
