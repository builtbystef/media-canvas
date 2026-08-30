import type { Identity } from "@media-canvas/api-client";
import { expect, test } from "vitest";

import { destinationFor } from "./identity.ts";

function identity(memberships: Identity["memberships"] = []): Identity {
  return {
    user: { id: "3f1b8f7e-2c2c-4a9a-9b5a-0b4a2f3d1c00", email: "someone@example.com" },
    memberships,
  };
}

const OWNED = {
  workspace: { id: "0f2d5a1c-77a1-4f7e-9c3e-8a1d6b2e4f10", name: "Studio" },
  role: "owner",
} as const;

test("somebody in a Workspace is sent to the product", () => {
  expect(destinationFor(identity([OWNED]))).toBe("/");
});

test("somebody in no Workspace is sent to make one", () => {
  expect(destinationFor(identity())).toBe("/workspaces/new");
});
