import { redirect } from "next/navigation";
import { currentIdentity, destinationFor } from "../../lib/identity";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in — Media Canvas" };

export default async function SignInPage() {
  // Asking somebody who is already signed in to sign in again is a dead end.
  // The check is here, on the server, so there is no moment where the form is
  // on screen before it is taken away again.
  const identity = await currentIdentity();
  if (identity !== null) redirect(destinationFor(identity));
  return <SignInForm />;
}
