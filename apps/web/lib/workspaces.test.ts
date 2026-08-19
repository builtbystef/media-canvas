import type { Identity, MembershipView } from "@media-canvas/api-client";
import { expect, test } from "vitest";

import { chosenMembership, mayChangeDocuments, rememberedWorkspace } from "./workspaces.ts";

/**
 * Which Workspace the shell is showing.
 *
 * A Workspace owns the documents, so every page is read through one, and the
 * switcher's choice has to survive a reload — which is why the choice is a
 * cookie: the list is rendered on the server, before anything in the browser
 * could tell it which Workspace to ask for.
 */

function membership(id: string, name: string, role: MembershipView["role"]): MembershipView {
  return { workspace: { id, name }, role };
}

const studio = membership("11111111-1111-4111-8111-111111111111", "Studio", "owner");
const agency = membership("22222222-2222-4222-8222-222222222222", "Agency", "viewer");

function identity(memberships: MembershipView[]): Identity {
  return {
    user: { id: "3f1b8f7e-2c2c-4a9a-9b5a-0b4a2f3d1c00", email: "someone@example.com" },
    memberships,
  };
}

test("the switcher's choice decides which Workspace the shell reads", () => {
  const chosen = chosenMembership(identity([studio, agency]), agency.workspace.id);

  expect(chosen).toBe(agency);
});

test("a choice that is no longer a membership falls back to the first one", () => {
  const gone = chosenMembership(identity([studio, agency]), "33333333-3333-4333-8333-333333333333");

  expect(gone).toBe(studio);
  expect(chosenMembership(identity([studio, agency]), undefined)).toBe(studio);
  expect(chosenMembership(identity([]), undefined)).toBeNull();
});

test("the remembered choice outlives the tab it was made in", () => {
  const remembered = rememberedWorkspace(agency.workspace.id);

  expect(remembered).toContain(`=${agency.workspace.id}`);
  expect(remembered).toContain("path=/");
  expect(remembered).toMatch(/max-age=\d{6,}/);
  expect(remembered).toContain("samesite=lax");
});

test("a Viewer is offered nothing that changes a document", () => {
  expect(mayChangeDocuments("viewer")).toBe(false);
  expect(mayChangeDocuments("editor")).toBe(true);
  expect(mayChangeDocuments("owner")).toBe(true);
});
