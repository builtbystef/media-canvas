import { getInvite } from "@media-canvas/api-client";
import Link from "next/link";
import { failedToLoadInvite } from "../../../lib/failures";
import { asThisCaller, currentIdentity } from "../../../lib/identity";
import { sessionSwitchNotice } from "../../../lib/invites";
import { SIGN_IN } from "../../../lib/routes";
import { buttonVariants } from "../../../components/ui/button";
import { AuthHeading, AuthScreen } from "../../../components/auth-screen";
import { InviteView } from "./invite-view";

export const metadata = { title: "Invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await currentIdentity();
  const { data, response } = await getInvite({
    ...(await asThisCaller()),
    path: { token },
  });
  if (data === undefined) {
    return (
      <AuthScreen>
        <InviteUnavailable status={response?.status} />
      </AuthScreen>
    );
  }
  return (
    <AuthScreen>
      <InviteView
        token={token}
        workspaceName={data.workspace_name}
        role={data.role}
        switchNotice={sessionSwitchNotice(identity?.user.email ?? null, data.email)}
      />
    </AuthScreen>
  );
}

function InviteUnavailable({ status }: { status: number | undefined }) {
  return (
    <>
      <AuthHeading title="This invite cannot be used">{failedToLoadInvite(status)}</AuthHeading>
      <Link href={SIGN_IN} className={buttonVariants({ className: "w-full" })}>
        Sign in
      </Link>
    </>
  );
}
