"use client";

import { useState } from "react";
import type { DesignDocument, VariableDecl, VariableType } from "@media-canvas/core";
import {
  createVariable,
  deleteVariable,
  describeVariableUsage,
  elementsUsingVariable,
  renameVariable,
  setVariableConstraints,
  setVariableDefault,
  variableUsage,
} from "../../../lib/variable-operations";
import { Button } from "../../../components/ui/button";
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";

const TYPES: readonly { type: VariableType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "color", label: "Color" },
  { type: "image", label: "Image" },
  { type: "boolean", label: "Boolean" },
];

const TYPE_LABEL: Record<VariableType, string> = Object.fromEntries(
  TYPES.map(({ type, label }) => [type, label]),
) as Record<VariableType, string>;

const FIELD = "grid gap-1 text-xs";
const CONTROL = "h-7 w-full min-w-0 text-xs";

type Change = (document: DesignDocument) => DesignDocument;

/**
 * The Variables of a Template: created, renamed, given defaults, and deleted
 * here. Binding lives in the inspector (0y2iw3); this panel is the list.
 */
export function VariablesPanel({
  document,
  mayEdit,
  onCommit,
}: {
  document: DesignDocument;
  mayEdit: boolean;
  onCommit: (change: Change, touched: readonly string[]) => void;
}) {
  const variables = document.variables ?? [];
  const [removing, setRemoving] = useState<VariableDecl | null>(null);

  return (
    <aside
      className="mt-3 min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10"
      aria-label="Variables"
    >
      <h2 className="font-heading mb-2 text-sm font-medium">Variables</h2>
      {mayEdit && <CreateVariable document={document} onCommit={onCommit} />}
      {variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {mayEdit ? "No Variables yet." : "This template has no Variables."}
        </p>
      ) : (
        <ul className="grid gap-3">
          {variables.map((variable) => (
            <VariableRow
              key={variable.name}
              document={document}
              variable={variable}
              mayEdit={mayEdit}
              onCommit={onCommit}
              onAskRemove={() => setRemoving(variable)}
            />
          ))}
        </ul>
      )}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `${describeVariableUsage(variableUsage(document, removing.name))} Deleting writes each bound property back to this Variable's default. Tokens in text stay as they are.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removing === null) return;
                const name = removing.name;
                const touched = elementsUsingVariable(document, name);
                onCommit((current) => deleteVariable(current, name), touched);
                setRemoving(null);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function CreateVariable({
  document,
  onCommit,
}: {
  document: DesignDocument;
  onCommit: (change: Change, touched: readonly string[]) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<VariableType>("text");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const result = createVariable(document, { name: name.trim(), type });
    if (!result.ok) {
      setError(nameError(result.reason));
      return;
    }
    onCommit((current) => {
      const created = createVariable(current, { name: name.trim(), type });
      return created.ok ? created.document : current;
    }, []);
    setName("");
    setError(null);
  }

  return (
    <div className="mb-3 grid gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Input
          className={CONTROL}
          aria-label="New Variable name"
          value={name}
          placeholder="Name"
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
        />
        <Select items={TYPE_LABEL} value={type} onValueChange={(next) => next && setType(next)}>
          <SelectTrigger size="sm" className={CONTROL} aria-label="New Variable type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map(({ type: option, label }) => (
              <SelectItem value={option} key={option}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" variant="outline" size="xs" onClick={add} disabled={name.trim() === ""}>
        Add Variable
      </Button>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function VariableRow({
  document,
  variable,
  mayEdit,
  onCommit,
  onAskRemove,
}: {
  document: DesignDocument;
  variable: VariableDecl;
  mayEdit: boolean;
  onCommit: (change: Change, touched: readonly string[]) => void;
  onAskRemove: () => void;
}) {
  const usage = variableUsage(document, variable.name);
  const uses = usage.properties + usage.textElements;
  const [error, setError] = useState<string | null>(null);

  function commit(change: Change) {
    onCommit(change, elementsUsingVariable(document, variable.name));
  }

  return (
    <li className="grid gap-1.5 border-t pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
        <NameField
          name={variable.name}
          disabled={!mayEdit}
          onRename={(next) => {
            const result = renameVariable(document, variable.name, next);
            if (!result.ok) {
              setError(nameError(result.reason));
              return false;
            }
            onCommit(() => result.document, elementsUsingVariable(document, variable.name));
            setError(null);
            return true;
          }}
        />
        <span className="text-xs text-muted-foreground">{TYPE_LABEL[variable.type]}</span>
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <DefaultControl
        variable={variable}
        disabled={!mayEdit}
        onChange={(value) => commit((current) => setVariableDefault(current, variable.name, value))}
      />
      {variable.type === "text" && (
        <div className="grid grid-cols-2 gap-1.5">
          <BoundField
            label="Min length"
            value={variable.constraints?.minLength}
            disabled={!mayEdit}
            onCommit={(minLength) =>
              commit((current) =>
                setVariableConstraints(
                  current,
                  variable.name,
                  bounds(variable.constraints, { minLength }),
                ),
              )
            }
          />
          <BoundField
            label="Max length"
            value={variable.constraints?.maxLength}
            disabled={!mayEdit}
            onCommit={(maxLength) =>
              commit((current) =>
                setVariableConstraints(
                  current,
                  variable.name,
                  bounds(variable.constraints, { maxLength }),
                ),
              )
            }
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {uses === 0 ? "unused" : `${String(uses)} ${uses === 1 ? "use" : "uses"}`}
        </span>
        {mayEdit && (
          <Button type="button" variant="ghost" size="xs" onClick={onAskRemove}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

function NameField({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled: boolean;
  onRename: (next: string) => boolean;
}) {
  const [typed, setTyped] = useState(name);

  function commit() {
    const next = typed.trim();
    if (next === "" || next === name) {
      setTyped(name);
      return;
    }
    if (!onRename(next)) setTyped(name);
  }

  return (
    <Input
      className={CONTROL}
      aria-label="Variable name"
      value={typed}
      disabled={disabled}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setTyped(name);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function DefaultControl({
  variable,
  disabled,
  onChange,
}: {
  variable: VariableDecl;
  disabled: boolean;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  switch (variable.type) {
    case "text":
      return (
        <Label className={FIELD}>
          Default
          <Input
            className={CONTROL}
            aria-label="Default text"
            key={String(variable.default ?? "")}
            defaultValue={typeof variable.default === "string" ? variable.default : ""}
            disabled={disabled}
            onBlur={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </Label>
      );
    case "number":
      return (
        <Label className={FIELD}>
          Default
          <Input
            className={CONTROL}
            aria-label="Default number"
            type="number"
            key={String(variable.default ?? "")}
            defaultValue={typeof variable.default === "number" ? variable.default : ""}
            disabled={disabled}
            onBlur={(event) => {
              const value = event.currentTarget.value;
              if (value === "") {
                onChange(undefined);
                return;
              }
              if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                onChange(event.currentTarget.valueAsNumber);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </Label>
      );
    case "color":
      return (
        <Label className={FIELD}>
          Default
          <Input
            className={`${CONTROL} px-1 py-1`}
            aria-label="Default color"
            type="color"
            value={typeof variable.default === "string" ? variable.default.slice(0, 7) : "#808080"}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          />
        </Label>
      );
    case "image":
      return (
        <Label className={FIELD}>
          Default
          <Input
            className={CONTROL}
            aria-label="Default Image Asset"
            key={String(variable.default ?? "")}
            defaultValue={typeof variable.default === "string" ? variable.default : ""}
            disabled={disabled}
            placeholder="Image Asset id"
            onBlur={(event) => onChange(event.currentTarget.value.trim() || undefined)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </Label>
      );
    case "boolean":
      return (
        <Label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={variable.default === true}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked)}
          />
          Default
        </Label>
      );
  }
}

function BoundField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  disabled: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  return (
    <Label className={FIELD}>
      {label}
      <Input
        className={CONTROL}
        type="number"
        min={0}
        key={String(value ?? "")}
        defaultValue={value ?? ""}
        disabled={disabled}
        onBlur={(event) => {
          const next = event.currentTarget.value;
          if (next === "") {
            onCommit(undefined);
            return;
          }
          if (Number.isFinite(event.currentTarget.valueAsNumber)) {
            onCommit(Math.max(0, event.currentTarget.valueAsNumber));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </Label>
  );
}

function nameError(reason: "invalid_name" | "collision"): string {
  return reason === "collision"
    ? "A Variable with that name already exists."
    : "Names start with a letter, then letters, digits or underscores.";
}

function bounds(
  current: { minLength?: number; maxLength?: number } | undefined,
  patch: { minLength?: number; maxLength?: number },
): { minLength?: number; maxLength?: number } | undefined {
  const minLength = "minLength" in patch ? patch.minLength : current?.minLength;
  const maxLength = "maxLength" in patch ? patch.maxLength : current?.maxLength;
  const next = {
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
  };
  return next.minLength === undefined && next.maxLength === undefined ? undefined : next;
}
