import { getInvite } from "@media-canvas/api-client";
import Link from "next/link";
import { failedToLoadInvite } from "../../../lib/failures";
import { asThisCaller, currentIdentity } from "../../../lib/identity";
import { sessionSwitchNotice } from "../../../lib/invites";
import { SIGN_IN } from "../../../lib/routes";
import { buttonVariants } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { InviteView } from "./invite-view";

export const metadata = { title: "Invite — Media Canvas" };

/**
 * The page at the end of an invite email.
 *
 * The token is the credential. Preview is unauthenticated and names the
 * Workspace, the Role, and the invited email; accept signs the visitor in
 * as that account. A different session already in the browser is a warning
 * on this page, not a silent switch and not a block.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await currentIdentity();
  const { data, response } = await getInvite({
    ...(await asThisCaller()),
    path: { token },
  });
  if (data === undefined) {
    return <InviteUnavailable status={response?.status} />;
  }
  return (
    <InviteView
      token={token}
      workspaceName={data.workspace_name}
      role={data.role}
      switchNotice={sessionSwitchNotice(identity?.user.email ?? null, data.email)}
    />
  );
}

function InviteUnavailable({ status }: { status: number | undefined }) {
  return (
    <main className="w-[min(26rem,100%)]">
      <Card>
        <CardHeader>
          <CardTitle>This invite cannot be used</CardTitle>
          <CardDescription>{failedToLoadInvite(status)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={SIGN_IN} className={buttonVariants({ className: "w-full" })}>
            Sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
