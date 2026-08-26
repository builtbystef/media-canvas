"use client";

import type { DesignDocument, VariableDecl } from "@media-canvas/core";
import { useState } from "react";
import { useStore } from "zustand";
import {
  DEFAULT_GENERATE_FORMAT,
  fieldErrors,
  GENERATE_FORMATS,
  generateDocument,
  initialValues,
  type GenerateFormat,
  type GenerateFormatKind,
} from "../../../lib/generate";
import type { EditorStore } from "../../../lib/editor-store";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

const FIELD = "grid gap-1 text-xs";
const CONTROL = "h-7 w-full min-w-0 text-xs";

/**
 * One click from the canvas to a file. A template fills its Variables; a
 * design is the format picker alone. The bytes come back as a download.
 */
export function GenerateAction({
  documentId,
  name,
  kind,
  store,
}: {
  documentId: string;
  name: string;
  kind: "design" | "template";
  store: EditorStore;
}) {
  const document = useStore(store, (state) => state.document);
  if (document === null) return null;
  return <GenerateDialog documentId={documentId} name={name} kind={kind} document={document} />;
}

function GenerateDialog({
  documentId,
  name,
  kind,
  document,
}: {
  documentId: string;
  name: string;
  kind: "design" | "template";
  document: DesignDocument;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => initialValues(document));
  const [format, setFormat] = useState<GenerateFormat>(DEFAULT_GENERATE_FORMAT);
  const [remoteErrors, setRemoteErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const localErrors = fieldErrors(document, values);
  const errors = { ...remoteErrors, ...localErrors };
  const blocked = Object.keys(localErrors).length > 0;
  const variables = document.variables ?? [];

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setValues(initialValues(document));
    setFormat(DEFAULT_GENERATE_FORMAT);
    setRemoteErrors({});
    setMessage(null);
  }

  function setValue(variable: string, value: unknown) {
    setValues((current) => ({ ...current, [variable]: value }));
    setRemoteErrors((current) => {
      if (!(variable in current)) return current;
      const { [variable]: _dropped, ...rest } = current;
      return rest;
    });
    setMessage(null);
  }

  async function generate() {
    if (blocked || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await generateDocument({
      documentId,
      name,
      kind,
      values,
      format,
    });
    setBusy(false);
    if (!result.ok) {
      setRemoteErrors(result.fieldErrors);
      setMessage(result.message);
      return;
    }
    deliverDownload(result.file, result.filename);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={<Button type="button" size="sm" />}>Generate</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate</DialogTitle>
          <DialogDescription>
            {kind === "template"
              ? "Fill each Variable, pick a format, and download the file."
              : "Pick a format and download the file."}
          </DialogDescription>
        </DialogHeader>
        {kind === "template" && variables.length > 0 && (
          <ul className="grid max-h-[min(24rem,50vh)] gap-3 overflow-y-auto">
            {variables.map((variable) => (
              <li key={variable.name}>
                <VariableInput
                  variable={variable}
                  value={values[variable.name]}
                  error={errors[variable.name]}
                  onChange={(value) => setValue(variable.name, value)}
                />
              </li>
            ))}
          </ul>
        )}
        <FormatPicker value={format} onChange={setFormat} />
        <Problem message={message} />
        <DialogFooter>
          <Button type="button" disabled={busy || blocked} onClick={() => void generate()}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The output-format picker: PNG ×1/2/3, JPEG with a quality, or PDF. */
export function FormatPicker({
  value,
  onChange,
}: {
  value: GenerateFormat;
  onChange: (next: GenerateFormat) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Format</legend>
      <div className="flex flex-wrap gap-1.5">
        {GENERATE_FORMATS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={value.format === kind ? "default" : "outline"}
            aria-pressed={value.format === kind}
            onClick={() => onChange(formatOf(kind, value))}
          >
            {kind.toUpperCase()}
          </Button>
        ))}
      </div>
      {value.format === "png" && (
        <div className="flex flex-wrap gap-1.5">
          {([1, 2, 3] as const).map((scale) => (
            <Button
              key={scale}
              type="button"
              size="sm"
              variant={value.scale === scale ? "default" : "outline"}
              aria-pressed={value.scale === scale}
              onClick={() => onChange({ format: "png", scale })}
            >
              {scale}×
            </Button>
          ))}
        </div>
      )}
      {value.format === "jpeg" && (
        <Label className={FIELD}>
          Quality
          <Input
            className={CONTROL}
            type="number"
            min={1}
            max={100}
            value={value.quality ?? 90}
            onChange={(event) => {
              const quality = Number(event.currentTarget.value);
              onChange({
                format: "jpeg",
                quality: Number.isFinite(quality) ? quality : 90,
              });
            }}
          />
        </Label>
      )}
    </fieldset>
  );
}

function formatOf(kind: GenerateFormatKind, current: GenerateFormat): GenerateFormat {
  if (kind === "png") {
    return { format: "png", scale: current.format === "png" ? current.scale : 1 };
  }
  if (kind === "jpeg") {
    return { format: "jpeg", quality: current.format === "jpeg" ? current.quality : 90 };
  }
  return { format: "pdf" };
}

function VariableInput({
  variable,
  value,
  error,
  onChange,
}: {
  variable: VariableDecl;
  value: unknown;
  error: string | undefined;
  onChange: (value: unknown) => void;
}) {
  const invalid = error !== undefined;
  return (
    <div className="grid gap-1">
      <ValueControl variable={variable} value={value} invalid={invalid} onChange={onChange} />
      {error !== undefined && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ValueControl({
  variable,
  value,
  invalid,
  onChange,
}: {
  variable: VariableDecl;
  value: unknown;
  invalid: boolean;
  onChange: (value: unknown) => void;
}) {
  switch (variable.type) {
    case "text":
      return (
        <Label className={FIELD}>
          {variable.name}
          <Input
            className={CONTROL}
            aria-invalid={invalid}
            aria-label={variable.name}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </Label>
      );
    case "number":
      return (
        <Label className={FIELD}>
          {variable.name}
          <Input
            className={CONTROL}
            aria-invalid={invalid}
            aria-label={variable.name}
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(event) => {
              const next = event.currentTarget.value;
              onChange(next === "" ? undefined : event.currentTarget.valueAsNumber);
            }}
          />
        </Label>
      );
    case "color":
      return (
        <Label className={FIELD}>
          {variable.name}
          <Input
            className={`${CONTROL} px-1 py-1`}
            aria-invalid={invalid}
            aria-label={variable.name}
            type="color"
            value={typeof value === "string" ? value.slice(0, 7) : "#808080"}
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          />
        </Label>
      );
    case "image":
      return (
        <Label className={FIELD}>
          {variable.name}
          <Input
            className={CONTROL}
            aria-invalid={invalid}
            aria-label={variable.name}
            value={typeof value === "string" ? value : ""}
            placeholder="Image Asset id"
            onChange={(event) => onChange(event.currentTarget.value.trim() || undefined)}
          />
        </Label>
      );
    case "boolean":
      return (
        <Label className="flex items-center gap-2 text-xs">
          <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
          {variable.name}
        </Label>
      );
  }
}

function deliverDownload(file: Blob, filename: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
