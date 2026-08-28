import type { InviteView, MemberView } from "@media-canvas/api-client";
import { expect, test } from "vitest";

import { SETTINGS } from "./routes.ts";
import {
  INVITE_SENT,
  OWNER_ONLY_INVITES,
  OWNER_ONLY_MEMBERS,
  OWNER_ONLY_WORKSPACE,
  inviteExpiryLabel,
  invitesAfterIssue,
  leaveRefusal,
  mayManageWorkspace,
  roleChangeRefusal,
  roleLabel,
} from "./settings.ts";

/**
 * What the settings area offers, and what it says when it will not.
 *
 * The api is the access control (sazdn4, k7wegl); this module is the words
 * and the affordances so an Editor is never offered an Owner action, and a
 * last Owner is told why rather than shown a failure.
 */

function member(id: string, email: string, role: MemberView["role"]): MemberView {
  return { user: { id, email }, role };
}

const owner = member("11111111-1111-4111-8111-111111111111", "owner@example.com", "owner");
const editor = member("22222222-2222-4222-8222-222222222222", "editor@example.com", "editor");
const viewer = member("33333333-3333-4333-8333-333333333333", "viewer@example.com", "viewer");

test("only an Owner is offered the actions that manage the Workspace", () => {
  expect(mayManageWorkspace("owner")).toBe(true);
  expect(mayManageWorkspace("editor")).toBe(false);
  expect(mayManageWorkspace("viewer")).toBe(false);
});

test("Owner-only panels stay visible and say why they will not act", () => {
  expect(OWNER_ONLY_MEMBERS).toMatch(/Owner/);
  expect(OWNER_ONLY_INVITES).toMatch(/Owner/);
  expect(OWNER_ONLY_WORKSPACE).toMatch(/Owner/);
  expect(new Set([OWNER_ONLY_MEMBERS, OWNER_ONLY_INVITES, OWNER_ONLY_WORKSPACE]).size).toBe(3);
});

test("the settings area is a page of the product", () => {
  expect(SETTINGS).toBe("/settings");
});

test("a Role is shown in the product's own words", () => {
  expect(roleLabel("owner")).toBe("Owner");
  expect(roleLabel("editor")).toBe("Editor");
  expect(roleLabel("viewer")).toBe("Viewer");
});

test("demoting the only Owner is refused with a reason, not a failure", () => {
  const otherOwner = member("44444444-4444-4444-8444-444444444444", "other@example.com", "owner");
  const refused = roleChangeRefusal([owner], owner.user.id, "editor");

  expect(refused).toMatch(/owner/i);
  expect(roleChangeRefusal([owner], owner.user.id, "owner")).toBeNull();
  expect(roleChangeRefusal([owner, editor], owner.user.id, "editor")).toMatch(/owner/i);
  expect(roleChangeRefusal([owner, otherOwner], owner.user.id, "editor")).toBeNull();
  expect(roleChangeRefusal([owner, editor], editor.user.id, "viewer")).toBeNull();
});

test("the only Owner leaving is told to promote someone first", () => {
  const refused = leaveRefusal([owner, editor, viewer], owner.user.id);

  expect(refused).toMatch(/promote/i);
  expect(leaveRefusal([owner, editor], editor.user.id)).toBeNull();
  expect(
    leaveRefusal(
      [owner, member("44444444-4444-4444-8444-444444444444", "other@example.com", "owner")],
      owner.user.id,
    ),
  ).toBeNull();
});

test("a pending invite says when it expires", () => {
  expect(inviteExpiryLabel("2026-07-04T12:00:00Z")).toBe("Expires 4 Jul 2026");
});

test("sending an invite states that the email went out, including where it lands in development", () => {
  expect(INVITE_SENT).toMatch(/sent/i);
  expect(INVITE_SENT).toMatch(/api log/i);
});

test("inviting an address that already has a pending invite replaces it", () => {
  const pending: InviteView = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "alex@example.com",
    role: "editor",
    expires_at: "2026-09-01T00:00:00Z",
  };
  const other: InviteView = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "blair@example.com",
    role: "viewer",
    expires_at: "2026-09-01T00:00:00Z",
  };
  const issued: InviteView = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    email: "alex@example.com",
    role: "viewer",
    expires_at: "2026-09-08T00:00:00Z",
  };

  expect(invitesAfterIssue([pending, other], issued)).toEqual([issued, other]);
});
