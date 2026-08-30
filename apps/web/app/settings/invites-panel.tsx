"use client";

import {
  createWorkspaceInvite,
  revokeWorkspaceInvite,
  type InviteView,
  type Role,
} from "@media-canvas/api-client";
import { useState } from "react";
import { Problem } from "../../components/problem";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { failedToRevokeInvite, failedToSendInvite } from "../../lib/failures";
import {
  INVITE_SENT,
  OWNER_ONLY_INVITES,
  ROLES,
  inviteExpiryLabel,
  invitesAfterIssue,
  roleLabel,
} from "../../lib/settings";

export function InvitesPanel({
  workspaceId,
  mayManage,
  initial,
}: {
  workspaceId: string;
  mayManage: boolean;
  initial: InviteView[] | undefined;
}) {
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (address === "") return;
    setBusy(true);
    setProblem(null);
    setSent(false);
    const { data, error, response } = await createWorkspaceInvite({
      path: { workspaceId },
      body: { email: address, role },
    });
    setBusy(false);
    if (error !== undefined || data === undefined) {
      setProblem(failedToSendInvite(response?.status));
      return;
    }
    setInvites((current) => invitesAfterIssue(current ?? [], data));
    setEmail("");
    setSent(true);
  }

  async function revoke(invite: InviteView) {
    setBusy(true);
    setProblem(null);
    const { error, response } = await revokeWorkspaceInvite({
      path: { workspaceId, inviteId: invite.id },
    });
    setBusy(false);
    if (error !== undefined) {
      setProblem(failedToRevokeInvite(response?.status));
      return;
    }
    setInvites((current) => current?.filter((row) => row.id !== invite.id));
  }

  return (
    <section className="mt-8">
      <h2 className="font-heading text-base font-semibold">Invites</h2>
      {mayManage ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => void send(event)}
        >
          <div className="grid gap-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(next) => {
                if (next === "owner" || next === "editor" || next === "viewer") setRole(next);
              }}
              disabled={busy}
              items={ROLES.map((named) => ({ value: named, label: roleLabel(named) }))}
            >
              <SelectTrigger id="invite-role" size="sm" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((named) => (
                  <SelectItem key={named} value={named}>
                    {roleLabel(named)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={busy || email.trim().length === 0}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{OWNER_ONLY_INVITES}</p>
      )}
      {sent ? (
        <p role="status" className="mt-2 text-sm">
          {INVITE_SENT}
        </p>
      ) : null}
      <Problem className="mt-2" message={problem} />
      {mayManage && invites === undefined ? (
        <Problem
          className="mt-3"
          message="These invites could not be loaded. Reload the page to try again."
        />
      ) : mayManage && (invites?.length ?? 0) === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No pending invites.</p>
      ) : mayManage ? (
        <ul className="mt-3">
          {(invites ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-4 border-t py-3">
              <span className="flex-1 text-sm font-medium">{row.email}</span>
              <span className="text-xs text-muted-foreground">{roleLabel(row.role)}</span>
              <span className="text-xs text-muted-foreground">
                {inviteExpiryLabel(row.expires_at)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void revoke(row)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
