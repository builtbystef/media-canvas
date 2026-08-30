"use client";

import { useState } from "react";
import { Input } from "../../../components/ui/input";

export function DocumentName({
  name,
  disabled,
  onCommit,
}: {
  name: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
  const [typed, setTyped] = useState(name);

  function commit() {
    const named = typed.trim();
    if (named === "" || named === name) {
      setTyped(name);
      return;
    }
    onCommit(named);
    setTyped(named);
  }

  return (
    <Input
      className="w-[min(20rem,40%)] border-transparent font-medium hover:border-input"
      aria-label="Document name"
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
