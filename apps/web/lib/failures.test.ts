import { expect, test } from "vitest";

import {
  DOCUMENT_CHANGED_ELSEWHERE,
  codeIsSpent,
  failedToCreateWorkspace,
  failedToSendCode,
  failedToChangeDocument,
  failedToEndJob,
  failedToPromoteDocument,
  failedToRenameDocument,
  failedToRenameWorkspace,
  failedToRevokeInvite,
  failedToSendInvite,
  failedToVerifyCode,
  failedToChangeMembership,
  failedToCreateApiKey,
  failedToDeleteWorkspace,
  failedToRevokeApiKey,
  failedToAcceptInvite,
  failedToLoadInvite,
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

/**
 * The refusals the shell can meet once somebody is inside.
 *
 * The api gates every document write on the Role in the record's Workspace and
 * on the Revision the caller loaded (qqzqhz), so a refusal here is either a
 * Role that changed under somebody, a document that is gone, or a save that
 * would overwrite another one.
 */

test("a document refusal says which of the three things went wrong", () => {
  const notAllowed = failedToChangeDocument(403);
  const gone = failedToChangeDocument(404);
  const changedElsewhere = failedToRenameDocument(409);

  expect(new Set([notAllowed, gone, changedElsewhere]).size).toBe(3);
  expect(notAllowed).toMatch(/Editor/);
  expect(gone).toMatch(/no longer/);
  expect(changedElsewhere).toMatch(/reload/i);
});

test("promoting has one refusal of its own: there is nothing to promote", () => {
  expect(failedToPromoteDocument(422)).toMatch(/already a template/i);
  expect(failedToPromoteDocument(403)).toBe(failedToChangeDocument(403));
});

test("a conflicting save names the reload and says nothing was merged", () => {
  expect(DOCUMENT_CHANGED_ELSEWHERE).toMatch(/changed elsewhere/i);
  expect(DOCUMENT_CHANGED_ELSEWHERE).toMatch(/reload/i);
  expect(DOCUMENT_CHANGED_ELSEWHERE).toMatch(/merged/i);
});

test("a refusal nobody recognises still says something true", () => {
  expect(failedToChangeDocument(500)).toBe(failedToChangeDocument(undefined));
  expect(failedToRenameDocument(418)).toBe(failedToChangeDocument(undefined));
});

test("a job cancel or delete refusal says which of the three things went wrong", () => {
  const notAllowed = failedToEndJob(403);
  const gone = failedToEndJob(404);
  const signedOut = failedToEndJob(401);

  expect(new Set([notAllowed, gone, signedOut]).size).toBe(3);
  expect(notAllowed).toMatch(/Editor/);
  expect(gone).toMatch(/no longer/);
  expect(signedOut).toMatch(/Sign in again/);
  expect(failedToEndJob(500)).toContain("could not be reached");
  expect(failedToEndJob(undefined)).toContain("could not be reached");
});

test("a last-Owner refusal is a reason to promote someone, not a failure", () => {
  const lastOwner = failedToChangeMembership(409);

  expect(lastOwner).toMatch(/promote/i);
  expect(lastOwner).toMatch(/owner/i);
  expect(failedToChangeMembership(403)).toMatch(/Owner/);
  expect(failedToChangeMembership(404)).toMatch(/no longer/);
  expect(failedToChangeMembership(500)).toContain("could not be reached");
});

test("renaming a Workspace reuses the name rule and refuses anyone but an Owner", () => {
  expect(failedToRenameWorkspace(422)).toBe(failedToCreateWorkspace(422));
  expect(failedToRenameWorkspace(403)).toMatch(/Owner/);
});

test("a refused invite names the address or the Role that blocked it", () => {
  expect(failedToSendInvite(422)).toContain("email address");
  expect(failedToSendInvite(403)).toMatch(/Owner/);
  expect(failedToSendInvite(401)).toContain("Sign in again");
});

test("deleting a Workspace is Owner-only and has no last-Owner case", () => {
  expect(failedToDeleteWorkspace(403)).toMatch(/Owner/);
  expect(failedToDeleteWorkspace(409)).toContain("could not be reached");
  expect(failedToDeleteWorkspace(500)).toContain("could not be reached");
});

test("revoking an invite that is gone is not a failure of the Role", () => {
  expect(failedToRevokeInvite(404)).toMatch(/no longer pending/);
  expect(failedToRevokeInvite(403)).toMatch(/Owner/);
  expect(failedToRevokeInvite(401)).toContain("Sign in again");
});

test("creating a key refuses a Role that cannot and a name that is empty", () => {
  expect(failedToCreateApiKey(403)).toMatch(/Owner/);
  expect(failedToCreateApiKey(422)).toMatch(/1 and 100/);
  expect(failedToCreateApiKey(401)).toContain("Sign in again");
  expect(failedToCreateApiKey(500)).toContain("could not be reached");
});

test("revoking a key that is gone is not a failure of the Role", () => {
  expect(failedToRevokeApiKey(404)).toMatch(/no longer/);
  expect(failedToRevokeApiKey(403)).toMatch(/Owner/);
  expect(failedToRevokeApiKey(401)).toContain("Sign in again");
});

test("a used, revoked, or unknown invite is not an expired one", () => {
  const gone = failedToLoadInvite(404);
  const expired = failedToLoadInvite(410);

  expect(new Set([gone, expired]).size).toBe(2);
  expect(gone).toMatch(/used/);
  expect(gone).toMatch(/revoked/);
  expect(expired).toMatch(/expired/i);
  expect(expired).toMatch(/Owner/);
  expect(failedToLoadInvite(500)).toContain("could not be reached");
  expect(failedToLoadInvite(undefined)).toContain("could not be reached");
});

test("accepting a spent invite uses the same words loading it did", () => {
  expect(failedToAcceptInvite(404)).toBe(failedToLoadInvite(404));
  expect(failedToAcceptInvite(410)).toBe(failedToLoadInvite(410));
  expect(failedToAcceptInvite(500)).toContain("could not be reached");
});
