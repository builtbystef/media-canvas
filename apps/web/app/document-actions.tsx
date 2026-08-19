"use client";

import { deleteDocument, promoteDocument, type DocumentSummary } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { failedToChangeDocument, failedToPromoteDocument } from "../lib/failures";

/**
 * What a row can do to its document besides open it.
 *
 * Promotion is offered on a design only — a template has nothing to be
 * promoted into — and it leaves the list showing both, the design and the
 * template it now has. Deleting asks first, because nothing else in the
 * product undoes it.
 */
export function DocumentActions({ row }: { row: DocumentSummary }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function promote() {
    setBusy(true);
    setProblem(null);
    const { error, response } = await promoteDocument({ path: { documentId: row.id } });
    setBusy(false);
    if (error !== undefined) {
      setProblem(failedToPromoteDocument(response?.status));
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    const { error, response } = await deleteDocument({ path: { documentId: row.id } });
    setBusy(false);
    setConfirming(false);
    if (error !== undefined) {
      setProblem(failedToChangeDocument(response?.status));
      return;
    }
    router.refresh();
  }

  return (
    <div className="actions">
      {row.kind === "design" && (
        <button type="button" className="plain" disabled={busy} onClick={() => void promote()}>
          Promote
        </button>
      )}
      <button type="button" className="plain" disabled={busy} onClick={() => setConfirming(true)}>
        Delete
      </button>
      <p className="problem" role="alert">
        {problem}
      </p>
      {confirming && (
        <div className="veil" role="presentation" onClick={() => setConfirming(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-${row.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`delete-${row.id}`}>Delete “{row.name}”?</h2>
            <p className="lead">
              This cannot be undone. A template promoted from this document is not deleted with it.
            </p>
            <p className="choices">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                className="plain"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
