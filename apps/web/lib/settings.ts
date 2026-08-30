import type { CreatedKey, InviteView, KeyView, MemberView, Role } from "@media-canvas/api-client";

export const ROLES: readonly Role[] = ["owner", "editor", "viewer"];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

export function mayManageWorkspace(role: Role): boolean {
  return role === "owner";
}

export const OWNER_ONLY_MEMBERS = "Only an Owner can change roles or remove members.";
export const OWNER_ONLY_INVITES = "Only an Owner can send and revoke invites.";
export const OWNER_ONLY_WORKSPACE = "Only an Owner can rename or delete this workspace.";
export const OWNER_ONLY_API_KEYS = "Only an Owner can create and revoke API keys.";

export function roleChangeRefusal(
  members: readonly MemberView[],
  userId: string,
  role: Role,
): string | null {
  if (role === "owner") return null;
  return isLastOwner(members, userId) ? "A workspace cannot be left without an owner." : null;
}

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

export function inviteExpiryLabel(expiresAt: string): string {
  return `Expires ${onThatDay.format(new Date(expiresAt))}`;
}

export const INVITE_SENT =
  "An invite email has been sent. In development, the link is printed in the api log.";

export function invitesAfterIssue(
  pending: readonly InviteView[],
  issued: InviteView,
): InviteView[] {
  return [issued, ...pending.filter((invite) => invite.email !== issued.email)];
}

export function listedAfterCreate(created: CreatedKey, createdAt: string): KeyView {
  return {
    id: created.id,
    name: created.name,
    prefix: created.prefix,
    created_at: createdAt,
    last_used_at: null,
  };
}

export function createdLabel(createdAt: string): string {
  return `Created ${onThatDay.format(new Date(createdAt))}`;
}

export function lastUsedLabel(lastUsedAt: string | null): string {
  return lastUsedAt === null ? "Never used" : `Last used ${onThatDay.format(new Date(lastUsedAt))}`;
}

export function keyPrefixLabel(prefix: string): string {
  return `mc_${prefix}`;
}

export const KEY_REVEAL_WARNING = "This key will not be shown again. Copy it now.";

export const KEY_REVOKE_WARNING = "Anything using this key stops working immediately.";
