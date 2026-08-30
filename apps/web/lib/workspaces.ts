import type { Identity, MembershipView, Role } from "@media-canvas/api-client";

export const WORKSPACE_COOKIE = "workspace";

const A_YEAR = 60 * 60 * 24 * 365;

export function chosenMembership(
  identity: Identity,
  chosen: string | undefined,
): MembershipView | null {
  const memberships = identity.memberships;
  return memberships.find(({ workspace }) => workspace.id === chosen) ?? memberships[0] ?? null;
}

export function membershipIn(identity: Identity, workspaceId: string): MembershipView | null {
  return identity.memberships.find(({ workspace }) => workspace.id === workspaceId) ?? null;
}

export function rememberedWorkspace(workspaceId: string): string {
  return `${WORKSPACE_COOKIE}=${workspaceId}; path=/; max-age=${String(A_YEAR)}; samesite=lax`;
}

export function mayChangeDocuments(role: Role): boolean {
  return role !== "viewer";
}

export const WORKSPACE_DELETE_WARNING =
  "Members lose access. Files are removed and the action cannot be undone.";
