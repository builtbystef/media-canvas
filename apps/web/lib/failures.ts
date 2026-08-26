/**
 * What went wrong, in words, and what to do about it.
 *
 * Sign-in has three refusals that need telling apart — the digits were wrong,
 * the code is past using, and codes are being asked for too fast — and each
 * one has a different next move. The api distinguishes them by status; this is
 * where a status becomes something to read.
 */

/** Nothing recognisable came back: the api is unreachable, or something broke. */
const UNREACHABLE = "The app could not be reached. Check your connection, then try again.";

const CODE_REQUEST: Record<number, string> = {
  429: "Codes have been requested for this address too quickly. Wait a minute, then ask again.",
  422: "That does not look like an email address.",
};

const CODE_VERIFICATION: Record<number, string> = {
  401: "That is not the code that was sent. Check the digits and try again.",
  410: "That code has expired or has already been used. Ask for a new one below.",
  429: "Codes have been requested for this address too quickly. Wait a minute, then ask again.",
  422: "A sign-in code is six digits.",
};

const WORKSPACE_CREATION: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  422: "A workspace name is between 1 and 100 characters.",
};

function explain(messages: Record<number, string>, status: number | undefined) {
  return (status === undefined ? undefined : messages[status]) ?? UNREACHABLE;
}

export const failedToSendCode = (status: number | undefined) => explain(CODE_REQUEST, status);

export const failedToVerifyCode = (status: number | undefined) =>
  explain(CODE_VERIFICATION, status);

export const failedToCreateWorkspace = (status: number | undefined) =>
  explain(WORKSPACE_CREATION, status);

/** A refused code is worth asking for a new one; wrong digits are not. */
export const codeIsSpent = (status: number | undefined) => status === 410;

const DOCUMENT_CHANGE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Editor or an Owner of this workspace can change its documents.",
  404: "That document is no longer here. Somebody may have deleted it.",
};

const DOCUMENT_PROMOTION: Record<number, string> = {
  ...DOCUMENT_CHANGE,
  422: "That document is already a template.",
};

const DOCUMENT_RENAME: Record<number, string> = {
  ...DOCUMENT_CHANGE,
  409: "This document changed elsewhere. Reload it before renaming, or the newer version is lost.",
};

/** Creating, deleting — anything the Workspace's Role decides. */
export const failedToChangeDocument = (status: number | undefined) =>
  explain(DOCUMENT_CHANGE, status);

/** Promotion adds the one refusal that is about the document, not the caller. */
export const failedToPromoteDocument = (status: number | undefined) =>
  explain(DOCUMENT_PROMOTION, status);

/** Renaming travels on the ordinary save, so it meets the Revision guard. */
export const failedToRenameDocument = (status: number | undefined) =>
  explain(DOCUMENT_RENAME, status);

/** The blocking notice a conflicting autosave shows. Nothing is merged. */
export const DOCUMENT_CHANGED_ELSEWHERE =
  "This document changed elsewhere and must be reloaded. Nothing was merged.";

const JOB_END: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Editor or an Owner of this workspace can cancel or delete its jobs.",
  404: "That job is no longer here. Somebody may have deleted it.",
};

/** Cancel and delete — Editor-level, and a missing job is the same as gone. */
export const failedToEndJob = (status: number | undefined) => explain(JOB_END, status);
