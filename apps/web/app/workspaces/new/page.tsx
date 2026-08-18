import { signedInOrSignIn } from "../../../lib/identity";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "New workspace — Media Canvas" };

export default async function NewWorkspacePage() {
  // Where a first sign-in lands, and also where a second workspace is made:
  // the only difference is what the page says about it.
  const identity = await signedInOrSignIn();
  return <WorkspaceForm first={identity.memberships.length === 0} />;
}
