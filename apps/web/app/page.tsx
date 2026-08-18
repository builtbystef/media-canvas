import Link from "next/link";
import { redirect } from "next/navigation";
import { signedInOrSignIn } from "../lib/identity";
import { NEW_WORKSPACE } from "../lib/routes";
import { SignOutButton } from "./sign-out-button";

/**
 * The product's front door.
 *
 * It is a placeholder: the shell, the workspace switcher, and the document
 * list are hg52gb's. What this page owns, and keeps owning, is the decision
 * above it — that reaching the product signed out sends you to sign-in, and
 * that reaching it with no workspace sends you to make one.
 */
export default async function Home() {
  const identity = await signedInOrSignIn();
  if (identity.memberships.length === 0) redirect(NEW_WORKSPACE);
  return (
    <main className="panel">
      <h1>Media Canvas</h1>
      <p className="lead">
        Signed in as <strong>{identity.user.email}</strong>.
      </p>
      <ul className="workspaces">
        {identity.memberships.map(({ workspace, role }) => (
          <li key={workspace.id}>
            <strong>{workspace.name}</strong>
            <span className="role">{role}</span>
          </li>
        ))}
      </ul>
      <p className="choices">
        <Link href={NEW_WORKSPACE}>Create another workspace</Link>
        <SignOutButton />
      </p>
    </main>
  );
}
