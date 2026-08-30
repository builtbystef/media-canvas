"use client";

import { deleteWorkspace, renameWorkspace } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Problem } from "../../components/problem";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { failedToDeleteWorkspace, failedToRenameWorkspace } from "../../lib/failures";
import { HOME } from "../../lib/routes";
import { OWNER_ONLY_WORKSPACE } from "../../lib/settings";
import { WORKSPACE_DELETE_WARNING } from "../../lib/workspaces";

const MAX_NAME = 100;

export function WorkspacePanel({
  workspaceId,
  name,
  mayManage,
}: {
  workspaceId: string;
  name: string;
  mayManage: boolean;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function commit() {
    const named = typed.trim();
    if (named === "" || named === name) {
      setTyped(name);
      return;
    }
    setBusy(true);
    setProblem(null);
    const { error, response } = await renameWorkspace({
      path: { workspaceId },
      body: { name: named },
    });
    setBusy(false);
    if (error !== undefined) {
      setTyped(name);
      setProblem(failedToRenameWorkspace(response?.status));
      return;
    }
    setTyped(named);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    const { error, response } = await deleteWorkspace({ path: { workspaceId } });
    if (error !== undefined) {
      setBusy(false);
      setConfirming(false);
      setProblem(failedToDeleteWorkspace(response?.status));
      return;
    }
    window.location.replace(HOME);
  }

  return (
    <section className="mt-8">
      <h2 className="font-heading text-base font-semibold">Workspace</h2>
      <div className="mt-3 flex items-center gap-2">
        {mayManage ? (
          <Input
            className="w-[min(20rem,100%)] border-transparent font-medium hover:border-input"
            aria-label="Workspace name"
            value={typed}
            disabled={busy}
            maxLength={MAX_NAME}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTyped(name);
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <p className="text-sm font-medium">{name}</p>
        )}
        {mayManage ? (
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogTrigger
              render={<Button type="button" variant="destructive" size="sm" disabled={busy} />}
            >
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
                <AlertDialogDescription>{WORKSPACE_DELETE_WARNING}</AlertDialogDescription>
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
        ) : null}
      </div>
      {mayManage ? null : (
        <p className="mt-2 text-sm text-muted-foreground">{OWNER_ONLY_WORKSPACE}</p>
      )}
      <Problem className="mt-2" message={problem} />
    </section>
  );
}
