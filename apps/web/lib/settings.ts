import type { CreatedKey, InviteView, KeyView, MemberView, Role } from "@media-canvas/api-client";

/**
 * What the settings area offers, and what it says when it will not.
 *
 * The api refuses every Owner-only call from an Editor or a Viewer, and every
 * last-Owner demotion or leave. This module is the screen's half of that:
 * never offer what the api will refuse, and when the last Owner tries, tell
 * them why rather than show a failure.
 */

/** The Roles, in the order an Owner picks one. */
export const ROLES: readonly Role[] = ["owner", "editor", "viewer"];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

/** A Role, as the panel writes it. */
export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

/**
 * Whether this Role may rename the Workspace, delete it, change who is in it,
 * send and revoke invites, or mint and revoke API keys.
 *
 * The api refuses anyone else either way; this is what keeps those actions
 * off their screen, so nothing is offered that cannot be done. Leave is not
 * among them — any member may, the last Owner aside.
 */
export function mayManageWorkspace(role: Role): boolean {
  return role === "owner";
}

export const OWNER_ONLY_MEMBERS = "Only an Owner can change roles or remove members.";
export const OWNER_ONLY_INVITES = "Only an Owner can send and revoke invites.";
export const OWNER_ONLY_WORKSPACE = "Only an Owner can rename or delete this workspace.";
export const OWNER_ONLY_API_KEYS = "Only an Owner can create and revoke API keys.";

/**
 * Why demoting this member is refused, or nothing when it is allowed.
 *
 * The last Owner cannot step down: a Workspace cannot be left without one.
 * Promoting is always allowed, and so is changing anyone who is not the
 * last Owner.
 */
export function roleChangeRefusal(
  members: readonly MemberView[],
  userId: string,
  role: Role,
): string | null {
  if (role === "owner") return null;
  return isLastOwner(members, userId) ? "A workspace cannot be left without an owner." : null;
}

/**
 * Why this member cannot leave, or nothing when they can.
 *
 * The last Owner is told to promote someone first — the same rule as a
 * demotion, in the words that tell them how to proceed.
 */
export function leaveRefusal(members: readonly MemberView[], userId: string): string | null {
  return isLastOwner(members, userId) ? "Promote someone else to Owner before leaving." : null;
}

function isLastOwner(members: readonly MemberView[], userId: string): boolean {
  const target = members.find((member) => member.user.id === userId);
  if (target === undefined || target.role !== "owner") return false;
  return members.filter((member) => member.role === "owner").length === 1;
}

const onThatDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** When a pending invite runs out, as the panel writes it. */
export function inviteExpiryLabel(expiresAt: string): string {
  return `Expires ${onThatDay.format(new Date(expiresAt))}`;
}

/**
 * What the panel says after an invite is accepted by the api.
 *
 * The Mailer always sends; in development the console driver prints the
 * link in the api log, so the wording names that place rather than pretending
 * a mailbox was involved.
 */
export const INVITE_SENT =
  "An invite email has been sent. In development, the link is printed in the api log.";

/**
 * The pending list after an invite is issued.
 *
 * Re-inviting an address replaces the pending row rather than adding a
 * second — the api does that, and the panel must show the same: one entry
 * for that address, the one just sent.
 */
export function invitesAfterIssue(
  pending: readonly InviteView[],
  issued: InviteView,
): InviteView[] {
  return [issued, ...pending.filter((invite) => invite.email !== issued.email)];
}

/**
 * The listed row after a key is minted: name, prefix, timestamps — never
 * the secret. The reveal holds the plaintext until the Owner dismisses it;
 * this is what remains afterwards, and what a reload of the page would show.
 */
export function listedAfterCreate(created: CreatedKey, createdAt: string): KeyView {
  return {
    id: created.id,
    name: created.name,
    prefix: created.prefix,
    created_at: createdAt,
    last_used_at: null,
  };
}

/** When this key was minted, as the panel writes it. */
export function createdLabel(createdAt: string): string {
  return `Created ${onThatDay.format(new Date(createdAt))}`;
}

/**
 * When this key was last used, or that it never has been.
 *
 * An unused key is a sentence, not a blank: the column would otherwise look
 * like a missing value rather than a fact.
 */
export function lastUsedLabel(lastUsedAt: string | null): string {
  return lastUsedAt === null ? "Never used" : `Last used ${onThatDay.format(new Date(lastUsedAt))}`;
}

/** The prefix as the start of the key, enough to recognise it. */
export function keyPrefixLabel(prefix: string): string {
  return `mc_${prefix}`;
}

/**
 * What the reveal says before the plaintext disappears.
 *
 * The copy action sits next to this. Dismissing the reveal is a button, not
 * a click outside or Escape — once it is gone, the product cannot show the
 * value again.
 */
export const KEY_REVEAL_WARNING = "This key will not be shown again. Copy it now.";

/** What revoking a key breaks: anything still using it, at once. */
export const KEY_REVOKE_WARNING = "Anything using this key stops working immediately.";
