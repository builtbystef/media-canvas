"use client";

import {
  createWorkspaceApiKey,
  deleteWorkspaceApiKey,
  type CreatedKey,
  type KeyView,
} from "@media-canvas/api-client";
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
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { failedToCreateApiKey, failedToRevokeApiKey } from "../../lib/failures";
import {
  KEY_REVEAL_WARNING,
  KEY_REVOKE_WARNING,
  OWNER_ONLY_API_KEYS,
  createdLabel,
  keyPrefixLabel,
  lastUsedLabel,
  listedAfterCreate,
} from "../../lib/settings";
import { SettingsSection } from "./settings-section";

const MAX_NAME = 100;

export function ApiKeysPanel({
  workspaceId,
  mayManage,
  initial,
}: {
  workspaceId: string;
  mayManage: boolean;
  initial: KeyView[] | undefined;
}) {
  const [keys, setKeys] = useState(initial);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);
  const [revoking, setRevoking] = useState<KeyView | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const named = name.trim();
    if (named === "") return;
    setBusy(true);
    setProblem(null);
    const { data, error, response } = await createWorkspaceApiKey({
      path: { workspaceId },
      body: { name: named },
    });
    setBusy(false);
    if (error !== undefined || data === undefined) {
      setProblem(failedToCreateApiKey(response?.status));
      return;
    }
    setKeys((current) => [...(current ?? []), listedAfterCreate(data, new Date().toISOString())]);
    setName("");
    setRevealed(data);
  }

  async function copy() {
    if (revealed === null) return;
    try {
      await navigator.clipboard.writeText(revealed.key);
    } catch {}
  }

  async function revoke(key: KeyView) {
    setBusy(true);
    setProblem(null);
    const { error, response } = await deleteWorkspaceApiKey({
      path: { workspaceId, apiKeyId: key.id },
    });
    setBusy(false);
    setRevoking(null);
    if (error !== undefined) {
      setProblem(failedToRevokeApiKey(response?.status));
      return;
    }
    setKeys((current) => current?.filter((row) => row.id !== key.id));
  }

  return (
    <SettingsSection
      title="API keys"
      description="Keys for programmatic access to this workspace. A key is shown once, when it is created."
    >
      {mayManage ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void create(event)}>
          <div className="grid gap-1">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              name="name"
              autoComplete="off"
              required
              maxLength={MAX_NAME}
              value={name}
              disabled={busy || revealed !== null}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || revealed !== null || name.trim().length === 0}>
            {busy ? "Creating…" : "Create key"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{OWNER_ONLY_API_KEYS}</p>
      )}
      <Problem className="mt-2" message={problem} />
      {mayManage && keys === undefined ? (
        <Problem
          className="mt-3"
          message="These API keys could not be loaded. Reload the page to try again."
        />
      ) : mayManage && (keys?.length ?? 0) === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No API keys.</p>
      ) : mayManage ? (
        <ul className="mt-4 divide-y border-t">
          {(keys ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span className="flex-1 text-sm font-medium">{row.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {keyPrefixLabel(row.prefix)}
              </span>
              <span className="text-xs text-muted-foreground">{createdLabel(row.created_at)}</span>
              <span className="text-xs text-muted-foreground">
                {lastUsedLabel(row.last_used_at)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || revealed !== null}
                onClick={() => setRevoking(row)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <AlertDialog
        open={revealed !== null}
        onOpenChange={(open, details) => {
          if (!open) details.cancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy this key</AlertDialogTitle>
            <AlertDialogDescription>{KEY_REVEAL_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label="API key"
              value={revealed?.key ?? ""}
              className="font-mono"
            />
            <Button type="button" size="sm" onClick={() => void copy()}>
              Copy
            </Button>
          </div>
          <AlertDialogFooter>
            <Button type="button" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>{KEY_REVOKE_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || revoking === null}
              onClick={() => revoking !== null && void revoke(revoking)}
            >
              {busy ? "Revoking…" : "Revoke"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
