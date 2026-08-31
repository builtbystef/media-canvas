"use client";

import {
  changeMemberRole,
  leaveWorkspace,
  removeWorkspaceMember,
  type MemberView,
  type Role,
} from "@media-canvas/api-client";
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
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { failedToChangeMembership } from "../../lib/failures";
import { HOME } from "../../lib/routes";
import {
  OWNER_ONLY_MEMBERS,
  ROLES,
  leaveRefusal,
  roleChangeRefusal,
  roleLabel,
} from "../../lib/settings";
import { SettingsSection } from "./settings-section";

export function MembersPanel({
  workspaceId,
  workspaceName,
  userId,
  mayManage,
  initial,
}: {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  mayManage: boolean;
  initial: MemberView[] | undefined;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [removing, setRemoving] = useState<MemberView | null>(null);

  async function changeRole(target: MemberView, role: string | null) {
    if (role === null || role === target.role) return;
    if (role !== "owner" && role !== "editor" && role !== "viewer") return;
    const next: Role = role;
    const refused = roleChangeRefusal(members ?? [], target.user.id, next);
    if (refused !== null) {
      setProblem(refused);
      return;
    }
    setBusy(true);
    setProblem(null);
    const { data, error, response } = await changeMemberRole({
      path: { workspaceId, userId: target.user.id },
      body: { role: next },
    });
    setBusy(false);
    if (error !== undefined || data === undefined) {
      setProblem(failedToChangeMembership(response?.status));
      return;
    }
    setMembers((current) =>
      current?.map((member) => (member.user.id === data.user.id ? data : member)),
    );
    if (target.user.id === userId) router.refresh();
  }

  async function remove(target: MemberView) {
    setBusy(true);
    setProblem(null);
    const { error, response } = await removeWorkspaceMember({
      path: { workspaceId, userId: target.user.id },
    });
    setBusy(false);
    setRemoving(null);
    if (error !== undefined) {
      setProblem(failedToChangeMembership(response?.status));
      return;
    }
    setMembers((current) => current?.filter((member) => member.user.id !== target.user.id));
  }

  function tryLeave() {
    const refused = leaveRefusal(members ?? [], userId);
    if (refused !== null) {
      setProblem(refused);
      return;
    }
    setConfirmingLeave(true);
  }

  async function leave() {
    setBusy(true);
    setProblem(null);
    const { error, response } = await leaveWorkspace({ path: { workspaceId } });
    if (error !== undefined) {
      setBusy(false);
      setConfirmingLeave(false);
      setProblem(failedToChangeMembership(response?.status));
      return;
    }
    window.location.replace(HOME);
  }

  return (
    <SettingsSection title="Members" description="The people with access to this workspace.">
      {members === undefined ? (
        <Problem message="These members could not be loaded. Reload the page to try again." />
      ) : (
        <ul className="divide-y">
          {members.map((row) => (
            <li key={row.user.id} className="flex items-center gap-4 py-3 first:pt-0">
              <span className="flex-1 text-sm font-medium">{row.user.email}</span>
              {mayManage ? (
                <Select
                  value={row.role}
                  onValueChange={(role) => void changeRole(row, role)}
                  disabled={busy}
                  items={ROLES.map((role) => ({ value: role, label: roleLabel(role) }))}
                >
                  <SelectTrigger size="sm" aria-label={`Role for ${row.user.email}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">{roleLabel(row.role)}</span>
              )}
              {mayManage && row.user.id !== userId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRemoving(row)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {mayManage ? null : (
        <p className="mt-2 text-sm text-muted-foreground">{OWNER_ONLY_MEMBERS}</p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={tryLeave}>
          Leave workspace
        </Button>
      </div>
      <Problem className="mt-2" message={problem} />
      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave “{workspaceName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access until someone invites you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void leave()}
            >
              {busy ? "Leaving…" : "Leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.user.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to this workspace until invited again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || removing === null}
              onClick={() => removing !== null && void remove(removing)}
            >
              {busy ? "Removing…" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
