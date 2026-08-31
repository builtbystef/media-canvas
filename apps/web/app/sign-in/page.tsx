import { redirect } from "next/navigation";
import { currentIdentity, destinationFor } from "../../lib/identity";
import { AuthScreen } from "../../components/auth-screen";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const identity = await currentIdentity();
  if (identity !== null) redirect(destinationFor(identity));
  return (
    <AuthScreen>
      <SignInForm />
    </AuthScreen>
  );
}
