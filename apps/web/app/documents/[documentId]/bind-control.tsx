"use client";

import { useState } from "react";
import type { DesignDocument, VariableType } from "@media-canvas/core";
import { VariableIcon } from "lucide-react";
import { isVariableName, matchingVariables } from "../../../lib/variable-operations";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

const CHIP =
  "inline-flex h-7 max-w-full items-center rounded-md bg-violet-600/15 px-2 text-xs font-medium text-violet-800 dark:text-violet-200";

export function BindControl({
  document,
  type,
  bound,
  onBind,
  onUnbind,
  onCreate,
}: {
  document: DesignDocument;
  type: VariableType;
  bound: string | undefined;
  onBind: (name: string) => void;
  onUnbind: () => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = matchingVariables(document, type);

  function create() {
    const next = name.trim();
    if (!isVariableName(next)) {
      setError("Names start with a letter, then letters, digits or underscores.");
      return;
    }
    if ((document.variables ?? []).some((variable) => variable.name === next)) {
      setError("A Variable with that name already exists.");
      return;
    }
    onCreate(next);
    setName("");
    setError(null);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <Button
        type="button"
        variant={bound === undefined ? "ghost" : "secondary"}
        size={bound === undefined ? "icon-xs" : "xs"}
        className={bound === undefined ? "text-muted-foreground" : CHIP}
        aria-label={bound === undefined ? "Bind to Variable" : bound}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        {bound === undefined ? <VariableIcon /> : bound}
      </Button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 min-w-40 rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          role="listbox"
          aria-label="Bind to Variable"
        >
          {matches.map((variable) => (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              key={variable.name}
              aria-selected={variable.name === bound}
              onClick={() => {
                onBind(variable.name);
                setOpen(false);
              }}
            >
              {variable.name}
            </Button>
          ))}
          {bound !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              onClick={() => {
                onUnbind();
                setOpen(false);
              }}
            >
              Unbind
            </Button>
          )}
          <div className="grid gap-1 border-t p-1">
            <Input
              className="h-7 text-xs"
              aria-label="New Variable name"
              value={name}
              placeholder="New Variable"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") create();
                if (event.key === "Escape") setOpen(false);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={create}
              disabled={name.trim() === ""}
            >
              Create
            </Button>
            {error !== null && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
