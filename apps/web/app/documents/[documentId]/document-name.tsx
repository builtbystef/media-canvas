"use client";

import { saveDocument, type DocumentView } from "@media-canvas/api-client";
import { useRef, useState } from "react";
import { failedToRenameDocument } from "../../../lib/failures";

/**
 * The document's name, renamed where it is displayed.
 *
 * A rename is not its own route: it travels on the ordinary save, with the
 * Revision the page loaded, so two tabs renaming the same document meet the
 * same guard every other save does. The commit is on blur or Enter — the
 * keystrokes in between are not saves.
 */
export function DocumentName({ loaded }: { loaded: DocumentView }) {
  // The name the api holds, which is what an abandoned or refused edit
  // returns to; `revision` is what the next save states it loaded.
  const [saved, setSaved] = useState(loaded.name);
  const [typed, setTyped] = useState(loaded.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef(loaded.revision);

  async function commit() {
    const named = typed.trim();
    // A document always has a name; an emptied field is an abandoned edit.
    if (named === "" || named === saved) {
      setTyped(saved);
      return;
    }
    setBusy(true);
    setProblem(null);
    const { data, error, response } = await saveDocument({
      path: { documentId: loaded.id },
      body: { document: loaded.document, revision: revision.current, name: named },
    });
    setBusy(false);
    if (error !== undefined || data === undefined) {
      setProblem(failedToRenameDocument(response?.status));
      setTyped(saved);
      return;
    }
    revision.current = data.revision;
    setSaved(named);
    setTyped(named);
  }

  return (
    <>
      <input
        className="document-name"
        aria-label="Document name"
        value={typed}
        disabled={busy}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setTyped(saved);
            event.currentTarget.blur();
          }
        }}
      />
      <p className="problem" role="alert">
        {problem}
      </p>
    </>
  );
}
