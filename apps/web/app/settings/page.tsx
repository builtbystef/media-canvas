import {
  listWorkspaceApiKeys,
  listWorkspaceInvites,
  listWorkspaceMembers,
  type InviteView,
  type KeyView,
} from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { asThisCaller, signedInOrSignIn } from "../../lib/identity";
import { NEW_WORKSPACE } from "../../lib/routes";
import { mayManageWorkspace } from "../../lib/settings";
import { WORKSPACE_COOKIE, chosenMembership } from "../../lib/workspaces";
import { ListNav } from "../list-nav";
import { Shell } from "../shell";
import { ApiKeysPanel } from "./api-keys-panel";
import { InvitesPanel } from "./invites-panel";
import { MembersPanel } from "./members-panel";
import { WorkspacePanel } from "./workspace-panel";

export const metadata = { title: "Settings — Media Canvas" };

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
    <Shell memberships={identity.memberships} current={chosen}>
      <main className="mt-6">
        <ListNav current="settings" />
        <h1 className="mt-4 font-heading text-xl font-semibold">Settings</h1>
        <Fragment key={chosen.workspace.id}>
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
        </Fragment>
      </main>
    </Shell>
  );
}
