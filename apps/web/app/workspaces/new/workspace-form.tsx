"use client";

import { createWorkspace } from "@media-canvas/api-client";
import { useState } from "react";
import { failedToCreateWorkspace } from "../../../lib/failures";
import { HOME } from "../../../lib/routes";
import { Problem } from "../../../components/problem";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

const MAX_NAME = 100;

export function WorkspaceForm({ first }: { first: boolean }) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const { error, response } = await createWorkspace({
      body: { name: name.trim() },
    });
    if (error !== undefined) {
      setBusy(false);
      setProblem(failedToCreateWorkspace(response?.status));
      return;
    }
    // Same reason as signing in: what the product shows is decided on the
    // server, from a membership that exists as of a moment ago.
    window.location.replace(HOME);
  }

  return (
    <main className="w-[min(26rem,100%)]">
      <Card>
        <CardHeader>
          <CardTitle>{first ? "Create your workspace" : "Create a workspace"}</CardTitle>
          <CardDescription>
            {first
              ? "A workspace holds your designs, templates, and assets. You will be its owner, and you can invite people to it later."
              : "A workspace holds its own designs, templates, and assets. You will be its owner."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2" onSubmit={submit}>
            <Label htmlFor="name">Workspace name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="off"
              autoFocus
              required
              maxLength={MAX_NAME}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Problem message={problem} />
            <Button
              type="submit"
              className="mt-2 w-full"
              disabled={busy || name.trim().length === 0}
            >
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
