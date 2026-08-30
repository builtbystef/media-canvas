import { signedInOrSignIn } from "../../../lib/identity";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "New workspace — Media Canvas" };

export default async function NewWorkspacePage() {
  const identity = await signedInOrSignIn();
  return <WorkspaceForm first={identity.memberships.length === 0} />;
}
