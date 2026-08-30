"use client";

import { signOut } from "@media-canvas/api-client";
import { useState } from "react";
import { SIGN_IN } from "../lib/routes";
import { Button } from "../components/ui/button";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    await signOut();
    window.location.replace(SIGN_IN);
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void leave()}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
