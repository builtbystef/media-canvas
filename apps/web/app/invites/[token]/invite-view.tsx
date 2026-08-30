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
