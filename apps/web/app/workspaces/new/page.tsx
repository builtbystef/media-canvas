import { signedInOrSignIn } from "../../../lib/identity";
import { AuthScreen } from "../../../components/auth-screen";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const identity = await signedInOrSignIn();
  return (
    <AuthScreen>
      <WorkspaceForm first={identity.memberships.length === 0} />
    </AuthScreen>
  );
}
