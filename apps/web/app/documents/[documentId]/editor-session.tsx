"use client";

import { saveDocument, type DocumentView } from "@media-canvas/api-client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginSave,
  failSave,
  isDirty,
  noteChange,
  noteRename,
  requestFlush,
  startAutosave,
  succeedSave,
  type Autosave,
} from "../../../lib/autosave";
import { kindLabel } from "../../../lib/documents";
import { createEditorStore } from "../../../lib/editor-store";
import { DOCUMENT_CHANGED_ELSEWHERE } from "../../../lib/failures";
import { openStoredDocument } from "../../../lib/open-document";
import { HOME } from "../../../lib/routes";
import { Problem } from "../../../components/problem";
import { Button, buttonVariants } from "../../../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { DocumentName } from "./document-name";
import { EditorCanvas } from "./editor-canvas";

/**
 * The open editor: migrate at load, hold the store, autosave against the
 * Revision guard, and put the saving indicator in the chrome.
 */
export function EditorSession({
  loaded,
  workspaceId,
  mayEdit,
}: {
  loaded: DocumentView;
  workspaceId: string | null;
  mayEdit: boolean;
}) {
  const opened = openStoredDocument(loaded.document);
  const [store] = useState(() => createEditorStore(opened.ok ? opened.document : null));
  const persist = useDocumentSave({
    documentId: loaded.id,
    revision: loaded.revision,
    name: loaded.name,
    store,
    enabled: mayEdit && opened.ok,
  });

  return (
    <div className="w-[min(64rem,100%)] self-start">
      <header className="flex items-center gap-3 border-b pb-4">
        <Link href={HOME} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Documents
        </Link>
        {mayEdit ? (
          <DocumentName
            name={persist.name}
            disabled={persist.indicator === "conflict"}
            onCommit={persist.rename}
          />
        ) : (
          <span className="text-sm font-medium">{loaded.name}</span>
        )}
        <span className="text-xs text-muted-foreground">{kindLabel(loaded.kind)}</span>
        {mayEdit && opened.ok ? <SaveIndicator indicator={persist.indicator} /> : null}
        <span className="flex-1" />
      </header>
      {opened.ok ? (
        <EditorCanvas store={store} documentId={loaded.id} workspaceId={workspaceId} />
      ) : (
        <main className="my-6 rounded-lg border p-12">
          <Problem message={opened.error.message} />
        </main>
      )}
      <AlertDialog open={persist.indicator === "conflict"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This document changed elsewhere</AlertDialogTitle>
            <AlertDialogDescription>{DOCUMENT_CHANGED_ELSEWHERE}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ indicator }: { indicator: Autosave["indicator"] }) {
  const label =
    indicator === "saving"
      ? "Saving…"
      : indicator === "warning"
        ? "Couldn't save — retrying"
        : indicator === "conflict"
          ? "Changed elsewhere"
          : "Saved";
  return (
    <span
      role="status"
      className={
        indicator === "warning" || indicator === "conflict"
          ? "text-xs text-destructive"
          : "text-xs text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

function useDocumentSave({
  documentId,
  revision,
  name,
  store,
  enabled,
}: {
  documentId: string;
  revision: number;
  name: string;
  store: ReturnType<typeof createEditorStore>;
  enabled: boolean;
}) {
  const [autosave, setAutosave] = useState(() =>
    startAutosave(revision, store.getState().document, name),
  );
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const inFlight = useRef(false);

  const apply = (next: Autosave) => {
    autosaveRef.current = next;
    setAutosave(next);
  };

  const save = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    const current = autosaveRef.current;
    const document = store.getState().document;
    if (document === null || current.indicator === "conflict" || !isDirty(current, document)) {
      return;
    }
    inFlight.current = true;
    apply(beginSave(current));
    const sentName = current.name;
    const { data, error, response } = await saveDocument({
      path: { documentId },
      body: { document, revision: current.revision, name: sentName },
    });
    inFlight.current = false;
    if (response?.status === 409) {
      apply(failSave(autosaveRef.current, Date.now(), "conflict"));
      return;
    }
    if (error !== undefined || data === undefined) {
      apply(failSave(autosaveRef.current, Date.now(), "other"));
      return;
    }
    let next = succeedSave(autosaveRef.current, data.revision, document, sentName);
    const live = store.getState().document;
    const liveName = autosaveRef.current.name;
    if (live !== null && live !== document) next = noteChange(next, live, Date.now());
    if (liveName !== sentName) next = noteRename(next, liveName, Date.now());
    apply(next);
  }, [documentId, enabled, store]);

  const flush = useCallback(() => {
    if (!enabled) return;
    apply(requestFlush(autosaveRef.current, Date.now()));
    void save();
  }, [enabled, save]);

  useEffect(() => {
    if (!enabled) return;
    return store.subscribe((next, previous) => {
      if (next.document !== previous.document && next.document !== null) {
        apply(noteChange(autosaveRef.current, next.document, Date.now()));
      }
    });
  }, [enabled, store]);

  useEffect(() => {
    if (!enabled || autosave.scheduledAt === null) return;
    const wait = Math.max(0, autosave.scheduledAt - Date.now());
    const timer = window.setTimeout(() => {
      void save();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [autosave.scheduledAt, enabled, save]);

  useEffect(() => {
    if (!enabled) return;
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const pressed = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      flush();
    };
    window.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    window.addEventListener("keydown", pressed);
    return () => {
      window.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keydown", pressed);
    };
  }, [enabled, flush]);

  return {
    name: autosave.name,
    indicator: autosave.indicator,
    flush,
    rename: (next: string) => {
      apply(noteRename(autosaveRef.current, next, Date.now()));
    },
  };
}
