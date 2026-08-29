"use client";

import { acceptInvite, type Role } from "@media-canvas/api-client";
import { useState } from "react";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { failedToAcceptInvite } from "../../../lib/failures";
import { HOME } from "../../../lib/routes";
import { roleLabel } from "../../../lib/settings";

/**
 * A pending invite: the Workspace, the Role, and the button that spends it.
 *
 * The call is made from the browser, not a server action, because accepting
 * answers with Set-Cookie — going through the rewrite is what puts the
 * session in the browser that will carry it afterwards.
 */
export function InviteView({
  token,
  workspaceName,
  role,
  switchNotice,
}: {
  token: string;
  workspaceName: string;
  role: Role;
  switchNotice: string | null;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const { error, response } = await acceptInvite({ path: { token } });
    if (error !== undefined) {
      setBusy(false);
      setProblem(failedToAcceptInvite(response?.status));
      return;
    }
    // A whole-document navigation, not a client-side one: the session cookie
    // has just changed, and every page decides what to show from it on the
    // server. Replacing the entry also keeps this invite page out of the
    // history the product is reached from.
    window.location.replace(HOME);
  }

  return (
    <main className="w-[min(26rem,100%)]">
      <Card>
        <CardHeader>
          <CardTitle>{workspaceName}</CardTitle>
          <CardDescription>You have been invited as {roleLabel(role)}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2" onSubmit={accept}>
            {switchNotice !== null ? <p className="text-sm">{switchNotice}</p> : null}
            <Problem message={problem} />
            <Button type="submit" className="mt-2 w-full" disabled={busy}>
              {busy ? "Accepting…" : "Accept invite"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
