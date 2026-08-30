import { getCurrentUser, type Identity } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HOME, NEW_WORKSPACE, SIGN_IN } from "./routes";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function asThisCaller() {
  const carried = (await cookies()).toString();
  return { baseUrl: API_URL, headers: { cookie: carried }, cache: "no-store" as const };
}

export async function currentIdentity(): Promise<Identity | null> {
  const { data } = await getCurrentUser(await asThisCaller());
  return data ?? null;
}

export async function signedInOrSignIn(): Promise<Identity> {
  const identity = await currentIdentity();
  if (identity === null) redirect(SIGN_IN);
  return identity;
}

export function destinationFor(identity: Identity): string {
  return identity.memberships.length > 0 ? HOME : NEW_WORKSPACE;
}
