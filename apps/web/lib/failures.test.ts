import { expect, test } from "vitest";

import {
  codeIsSpent,
  failedToCreateWorkspace,
  failedToSendCode,
  failedToVerifyCode,
} from "./failures.ts";

/**
 * The refusals a person can meet, and the next move each one names.
 *
 * The statuses are the api's, from the accounts spec (88v6vg): 401 wrong
 * digits, 410 spent, 429 too fast, 422 malformed. What is asserted here is
 * that each stays its own answer, and that an unrecognised one still says
 * something true rather than nothing.
 */

test("the three sign-in refusals are told apart, and each names its next move", () => {
  const wrongDigits = failedToVerifyCode(401);
  const spent = failedToVerifyCode(410);
  const tooFast = failedToVerifyCode(429);

  expect(new Set([wrongDigits, spent, tooFast]).size).toBe(3);
  expect(wrongDigits).toContain("try again");
  expect(spent).toContain("Ask for a new one");
  expect(tooFast).toContain("Wait a minute");
});

test("a spent code is the one worth asking again for", () => {
  expect(codeIsSpent(410)).toBe(true);
  expect(codeIsSpent(401)).toBe(false);
  expect(codeIsSpent(429)).toBe(false);
  expect(codeIsSpent(undefined)).toBe(false);
});

test("asking for a code has its own limit and its own malformed address", () => {
  expect(failedToSendCode(429)).toContain("Wait a minute");
  expect(failedToSendCode(422)).toContain("email address");
});

test("a lost session and a rejected name are different workspace refusals", () => {
  expect(failedToCreateWorkspace(401)).toContain("Sign in again");
  expect(failedToCreateWorkspace(422)).toContain("1 and 100");
});

test("nothing recognisable back is reported as the app being unreachable", () => {
  // No response at all, and a status no route documents, are the same thing
  // to the person reading it: the app could not be reached.
  for (const explain of [failedToSendCode, failedToVerifyCode, failedToCreateWorkspace]) {
    expect(explain(undefined)).toContain("could not be reached");
    expect(explain(500)).toContain("could not be reached");
  }
});

test("a refusal one call knows is not carried into another", () => {
  // 410 is a sign-in code's answer; workspace creation has no such refusal,
  // and must not borrow its wording.
  expect(failedToCreateWorkspace(410)).toContain("could not be reached");
  expect(failedToSendCode(401)).toContain("could not be reached");
});
