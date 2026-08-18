"use client";

import { signOut } from "@media-canvas/api-client";
import { useState } from "react";
import { SIGN_IN } from "../lib/routes";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    await signOut();
    // A whole-document navigation, replacing this entry rather than adding
    // one. The session row is already gone, so nothing signed-in could be
    // served again — and this makes sure nothing cached is shown either:
    // every client-side cache of the product goes with the document, and the
    // history entry the product was at is no longer there to go back to.
    window.location.replace(SIGN_IN);
  }

  return (
    <button type="button" className="plain" disabled={busy} onClick={() => void leave()}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
