import { redirect } from "next/navigation";
import { currentIdentity, destinationFor } from "../../lib/identity";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in — Media Canvas" };

export default async function SignInPage() {
  const identity = await currentIdentity();
  if (identity !== null) redirect(destinationFor(identity));
  return <SignInForm />;
}
