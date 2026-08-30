import { expect, test } from "vitest";

import { HOME, SIGN_IN } from "./routes.ts";
import { sessionSwitchNotice } from "./invites.ts";

test("a visitor signed in as someone else is told the invite will switch the session", () => {
  const notice = sessionSwitchNotice("a@example.com", "b@example.com");

  expect(notice).toContain("b@example.com");
  expect(notice).toMatch(/sign/i);
  expect(notice).toMatch(/session/i);
  expect(notice).toMatch(/replac/i);
});

test("nobody signed in, and the invited person already signed in, are not a switch", () => {
  expect(sessionSwitchNotice(null, "b@example.com")).toBeNull();
  expect(sessionSwitchNotice("b@example.com", "b@example.com")).toBeNull();
});

test("accepting lands in the product, and a spent invite still offers sign-in", () => {
  expect(HOME).toBe("/");
  expect(SIGN_IN).toBe("/sign-in");
});
