import {
  listWorkspaceApiKeys,
  listWorkspaceInvites,
  listWorkspaceMembers,
  type InviteView,
  type KeyView,
} from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../lib/identity";
import { NEW_WORKSPACE } from "../../lib/routes";
import { mayManageWorkspace } from "../../lib/settings";
import { WORKSPACE_COOKIE, chosenMembership } from "../../lib/workspaces";
import { Shell } from "../shell";
import { ApiKeysPanel } from "./api-keys-panel";
import { InvitesPanel } from "./invites-panel";
import { MembersPanel } from "./members-panel";
import { WorkspacePanel } from "./workspace-panel";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const identity = await signedInOrSignIn();
  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  if (chosen === null) redirect(NEW_WORKSPACE);

  const caller = await asThisCaller();
  const path = { workspaceId: chosen.workspace.id };
  const mayManage = mayManageWorkspace(chosen.role);
  const { data: members } = await listWorkspaceMembers({ ...caller, path });
  let invites: InviteView[] | undefined = [];
  let keys: KeyView[] | undefined = [];
  if (mayManage) {
    const listedInvites = await listWorkspaceInvites({ ...caller, path });
    invites = listedInvites.data;
    const listedKeys = await listWorkspaceApiKeys({ ...caller, path });
    keys = listedKeys.data;
  }

  return (
    <Shell memberships={identity.memberships} current={chosen} page="settings">
      <main>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage this workspace, its members, and its API keys.
        </p>
        <div key={chosen.workspace.id} className="mt-8 grid gap-6">
          <WorkspacePanel
            workspaceId={chosen.workspace.id}
            name={chosen.workspace.name}
            mayManage={mayManage}
          />
          <MembersPanel
            workspaceId={chosen.workspace.id}
            workspaceName={chosen.workspace.name}
            userId={identity.user.id}
            mayManage={mayManage}
            initial={members}
          />
          <InvitesPanel workspaceId={chosen.workspace.id} mayManage={mayManage} initial={invites} />
          <ApiKeysPanel workspaceId={chosen.workspace.id} mayManage={mayManage} initial={keys} />
        </div>
      </main>
    </Shell>
  );
}
