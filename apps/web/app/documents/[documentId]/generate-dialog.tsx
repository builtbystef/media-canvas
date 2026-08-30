"use client";

import type { DesignDocument, VariableDecl } from "@media-canvas/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useStore } from "zustand";
import {
  mapHeaders,
  mergeRefusal,
  prepareBatch,
  submitBatch,
  type HeaderMapping,
  type PreparedBatch,
  type PreviewRefusal,
} from "../../../lib/batch";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"one-off" | "batch">("one-off");
  const [values, setValues] = useState(() => initialValues(document));
  const [format, setFormat] = useState<GenerateFormat>(DEFAULT_GENERATE_FORMAT);
  const [prepared, setPrepared] = useState<PreparedBatch | null>(null);
  const [refusal, setRefusal] = useState<PreviewRefusal | null>(null);
  const [remoteErrors, setRemoteErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const localErrors = fieldErrors(document, values);
  const errors = { ...remoteErrors, ...localErrors };
  const blocked = Object.keys(localErrors).length > 0;
  const variables = document.variables ?? [];
  const batchOpen = kind === "template" && tab === "batch";

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setTab("one-off");
    setValues(initialValues(document));
    setFormat(DEFAULT_GENERATE_FORMAT);
    setPrepared(null);
    setRefusal(null);
    setRemoteErrors({});
    setMessage(null);
  }

  async function pickCsv(file: File) {
    setRefusal(null);
    setMessage(null);
    const text = await file.text();
    setPrepared(prepareBatch(text));
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

  async function submit() {
    if (prepared === null || busy) return;
    setBusy(true);
    setMessage(null);
    setRefusal(null);
    const result = await submitBatch({
      templateId: documentId,
      bytes: prepared.bytes,
      format,
      idempotencyKey: prepared.idempotencyKey,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.refusal !== null) {
        setRefusal(mergeRefusal(prepared, result.refusal));
        return;
      }
      setMessage(result.message);
      return;
    }
    setOpen(false);
    router.push(result.path);
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={<Button type="button" size="sm" />}>Generate</DialogTrigger>
      <DialogContent className={batchOpen && prepared !== null ? "sm:max-w-3xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Generate</DialogTitle>
          <DialogDescription>
            {kind === "template"
              ? batchOpen
                ? "Pick a CSV, check the columns against the Template, and submit."
                : "Fill each Variable, pick a format, and download the file."
              : "Pick a format and download the file."}
          </DialogDescription>
        </DialogHeader>
        {kind === "template" && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Generate">
            <Button
              type="button"
              size="sm"
              variant={tab === "one-off" ? "default" : "outline"}
              role="tab"
              aria-selected={tab === "one-off"}
              onClick={() => setTab("one-off")}
            >
              One-off
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "batch" ? "default" : "outline"}
              role="tab"
              aria-selected={tab === "batch"}
              onClick={() => setTab("batch")}
            >
              Batch
            </Button>
          </div>
        )}
        {batchOpen ? (
          <BatchPanel
            variables={variables}
            prepared={prepared}
            refusal={refusal}
            onPick={pickCsv}
          />
        ) : (
          kind === "template" &&
          variables.length > 0 && (
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
          )
        )}
        <FormatPicker value={format} onChange={setFormat} />
        <Problem message={message} />
        <DialogFooter>
          {batchOpen ? (
            <Button
              type="button"
              disabled={busy || prepared === null}
              onClick={() => void submit()}
            >
              {busy ? "Submitting…" : "Submit"}
            </Button>
          ) : (
            <Button type="button" disabled={busy || blocked} onClick={() => void generate()}>
              {busy ? "Generating…" : "Generate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

function BatchPanel({
  variables,
  prepared,
  refusal,
  onPick,
}: {
  variables: VariableDecl[];
  prepared: PreparedBatch | null;
  refusal: PreviewRefusal | null;
  onPick: (file: File) => void;
}) {
  const jumpRef = useRef<((index: number) => void) | null>(null);
  const mapping = prepared === null ? null : mapHeaders(prepared.headers, variables);
  return (
    <div className="grid gap-3">
      <Label className={FIELD}>
        CSV file
        <Input
          className={CONTROL}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file !== undefined) onPick(file);
          }}
        />
      </Label>
      {mapping !== null && prepared !== null && (
        <>
          <MappingSummary mapping={mapping} />
          {refusal !== null && (
            <RefusalSummary refusal={refusal} onJump={(index) => jumpRef.current?.(index)} />
          )}
          <CsvPreview
            headers={prepared.headers}
            rows={prepared.rows}
            refusal={refusal}
            jumpRef={jumpRef}
          />
        </>
      )}
    </div>
  );
}

function RefusalSummary({
  refusal,
  onJump,
}: {
  refusal: PreviewRefusal;
  onJump: (index: number) => void;
}) {
  return (
    <section className="grid gap-2 text-xs" aria-label="Submission refused">
      <p role="alert" className="text-sm text-destructive">
        {refusal.countLine}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onJump(refusal.firstRowIndex)}
      >
        Jump to first invalid row
      </Button>
      <ol className="grid max-h-32 gap-1 overflow-y-auto">
        {refusal.groups.map((group) => (
          <li key={group.rowIndex}>
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => onJump(group.rowIndex)}
            >
              {group.name === null
                ? `Row ${String(group.rowIndex)}`
                : `Row ${String(group.rowIndex)} (${group.name})`}
            </button>
            <span className="text-destructive"> {group.messages.join("; ")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MappingSummary({ mapping }: { mapping: HeaderMapping }) {
  return (
    <section className="grid gap-1 text-xs" aria-label="Column mapping">
      <p>
        <span className="font-medium">Matched.</span> {named(mapping.matched)}
      </p>
      <p>
        <span className="font-medium">Missing, using default.</span>{" "}
        {named(mapping.missingDefaulted)}
      </p>
      <p>
        <span className="font-medium">Missing, required.</span> {named(mapping.missingRequired)}
      </p>
      <p>
        <span className="font-medium">Unknown columns.</span> {named(mapping.unknown)}
      </p>
      <p>
        <span className="font-medium">Row-name column.</span>{" "}
        {mapping.nameColumn ? "recognized" : "not present"}
      </p>
    </section>
  );
}

function named(names: readonly string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

function CsvPreview({
  headers,
  rows,
  refusal,
  jumpRef,
}: {
  headers: string[];
  rows: string[][];
  refusal: PreviewRefusal | null;
  jumpRef: { current: ((index: number) => void) | null };
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });
  jumpRef.current = (index) => {
    virtualizer.scrollToIndex(index, { align: "start" });
  };

  return (
    <div className="overflow-hidden rounded-md border" aria-label="CSV preview">
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-xs">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((header, index) => (
                <th key={`${header}-${String(index)}`} className="px-2 py-1 text-left font-medium">
                  {header === "" ? "\u00a0" : header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <div ref={parentRef} className="h-64 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index] ?? [];
            const messages = refusal?.messagesByRow.get(item.index);
            const marked = messages !== undefined;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className={
                  marked
                    ? "absolute top-0 left-0 grid w-full border-t bg-destructive/10 px-0 text-xs"
                    : "absolute top-0 left-0 grid w-full border-t px-0 text-xs"
                }
                style={{
                  transform: `translateY(${String(item.start)}px)`,
                  gridTemplateColumns: `repeat(${String(Math.max(headers.length, 1))}, minmax(6rem, 1fr))`,
                }}
              >
                {headers.map((header, index) => (
                  <span key={`${header}-${String(index)}`} className="truncate px-2 py-1">
                    {row[index] ?? ""}
                  </span>
                ))}
                {marked && (
                  <span className="px-2 pb-1 text-destructive" style={{ gridColumn: "1 / -1" }}>
                    {messages.join("; ")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
