import { getCurrentUser, type Identity } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HOME, NEW_WORKSPACE, SIGN_IN } from "./routes";

// Server-side calls go straight to the api. The browser's own calls are
// same-origin and reach it through the rewrite in `next.config.ts`, which is
// what a deployed stack does behind its proxy too — so the session cookie is
// first-party either way, and no CORS is involved.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

/**
 * Who this request is from, or nobody.
 *
 * The whole cookie header is handed to the api rather than the session cookie
 * by name: which cookie carries a session, and whether the one presented is
 * still good, are the api's questions, and this is the only place the web app
 * asks them.
 */
export async function currentIdentity(): Promise<Identity | null> {
  const carried = (await cookies()).toString();
  const { data } = await getCurrentUser({
    baseUrl: API_URL,
    headers: { cookie: carried },
    cache: "no-store",
  });
  return data ?? null;
}

/** The identity behind an app page, or the sign-in page instead of one. */
export async function signedInOrSignIn(): Promise<Identity> {
  const identity = await currentIdentity();
  if (identity === null) redirect(SIGN_IN);
  return identity;
}

/**
 * The page a signed-in person is due.
 *
 * Somebody who is in no Workspace can do nothing in the product yet, so the
 * only place to send them is the one screen that changes that.
 */
export function destinationFor(identity: Identity): string {
  return identity.memberships.length > 0 ? HOME : NEW_WORKSPACE;
}
