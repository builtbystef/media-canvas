"use client";

import { deleteDocument, type DocumentSummary } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { failedToChangeDocument } from "../lib/failures";
import { promoteToTemplate } from "../lib/promote";
import { Problem } from "../components/problem";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

/**
 * What a row can do to its document besides open it.
 *
 * Promotion is offered on a design only — a template has nothing to be
 * promoted into — and it opens the new copy, the same as the editor's top-bar
 * action. Deleting asks first, because nothing else in the product undoes it:
 * an alert dialog rather than a plain one, so the choice is what the surface
 * is for and escape does not stand in for cancelling.
 */
export function DocumentActions({ row }: { row: DocumentSummary }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function promote() {
    setBusy(true);
    setProblem(null);
    const result = await promoteToTemplate(row.id);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    router.push(result.path);
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
    <div className="flex items-center gap-1">
      {row.kind === "design" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void promote()}
        >
          Promote
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={<Button type="button" variant="ghost" size="sm" disabled={busy} />}
        >
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{row.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. A template promoted from this document is not deleted with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Problem message={problem} />
    </div>
  );
}
