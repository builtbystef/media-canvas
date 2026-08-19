import type { Identity, MembershipView, Role } from "@media-canvas/api-client";

/**
 * The Workspace the shell is showing, and what the Role in it allows.
 *
 * A Workspace owns the documents (ADR-0009), so the list, the creation dialog
 * and every asset the editor reaches are read through one. The switcher's
 * choice lives in a cookie because the pages are rendered on the server: the
 * request has to carry the answer with it, or the first paint is of the wrong
 * Workspace.
 */

/** The cookie the switcher writes and every page reads. */
export const WORKSPACE_COOKIE = "workspace";

const A_YEAR = 60 * 60 * 24 * 365;

/**
 * The Workspace to show, given what was chosen last.
 *
 * A choice that is no longer a membership — left, removed, or deleted — is not
 * an error to report: the first Workspace is as good an answer as the shell
 * had before anybody chose.
 */
export function chosenMembership(
  identity: Identity,
  chosen: string | undefined,
): MembershipView | null {
  const memberships = identity.memberships;
  return memberships.find(({ workspace }) => workspace.id === chosen) ?? memberships[0] ?? null;
}

/** The cookie that carries a choice into the next request, and the next visit. */
export function rememberedWorkspace(workspaceId: string): string {
  return `${WORKSPACE_COOKIE}=${workspaceId}; path=/; max-age=${String(A_YEAR)}; samesite=lax`;
}

/**
 * Whether this Role may create, promote, rename, or delete a document.
 *
 * The api refuses a Viewer either way; this is what keeps the actions off
 * their screen, so nothing is offered that cannot be done.
 */
export function mayChangeDocuments(role: Role): boolean {
  return role !== "viewer";
}
