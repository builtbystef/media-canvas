"use client";

import { createWorkspace } from "@media-canvas/api-client";
import { useState } from "react";
import { failedToCreateWorkspace } from "../../../lib/failures";
import { HOME } from "../../../lib/routes";

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
    <main className="panel">
      <h1>{first ? "Create your workspace" : "Create a workspace"}</h1>
      <form onSubmit={submit}>
        <p className="lead">
          {first
            ? "A workspace holds your designs, templates, and assets. You will be its owner, and you can invite people to it later."
            : "A workspace holds its own designs, templates, and assets. You will be its owner."}
        </p>
        <label htmlFor="name">Workspace name</label>
        <input
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
        <p className="problem" role="alert">
          {problem}
        </p>
        <button type="submit" disabled={busy || name.trim().length === 0}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </main>
  );
}
