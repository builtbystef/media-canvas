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

export const failedToChangeDocument = (status: number | undefined) =>
  explain(DOCUMENT_CHANGE, status);

export const failedToPromoteDocument = (status: number | undefined) =>
  explain(DOCUMENT_PROMOTION, status);

export const failedToRenameDocument = (status: number | undefined) =>
  explain(DOCUMENT_RENAME, status);

export const DOCUMENT_CHANGED_ELSEWHERE =
  "This document changed elsewhere and must be reloaded. Nothing was merged.";

const JOB_END: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Editor or an Owner of this workspace can cancel or delete its jobs.",
  404: "That job is no longer here. Somebody may have deleted it.",
};

export const failedToEndJob = (status: number | undefined) => explain(JOB_END, status);

const MEMBERSHIP_CHANGE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can change who is in it.",
  404: "That member is no longer here.",
  409: "Promote someone else to Owner first. A workspace cannot be left without an owner.",
};

const WORKSPACE_RENAME: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can rename it.",
  422: "A workspace name is between 1 and 100 characters.",
};

const INVITE_SEND: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can send invites.",
  422: "That does not look like an email address.",
};

export const failedToChangeMembership = (status: number | undefined) =>
  explain(MEMBERSHIP_CHANGE, status);

export const failedToRenameWorkspace = (status: number | undefined) =>
  explain(WORKSPACE_RENAME, status);

export const failedToSendInvite = (status: number | undefined) => explain(INVITE_SEND, status);

const WORKSPACE_DELETE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can delete it.",
};

const INVITE_REVOKE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can revoke invites.",
  404: "That invite is no longer pending.",
};

export const failedToDeleteWorkspace = (status: number | undefined) =>
  explain(WORKSPACE_DELETE, status);

export const failedToRevokeInvite = (status: number | undefined) => explain(INVITE_REVOKE, status);

const API_KEY_CREATE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can create API keys.",
  422: "A key name is between 1 and 100 characters.",
};

const API_KEY_REVOKE: Record<number, string> = {
  401: "You have been signed out. Sign in again to carry on.",
  403: "Only an Owner of this workspace can revoke API keys.",
  404: "That API key is no longer here.",
};

export const failedToCreateApiKey = (status: number | undefined) => explain(API_KEY_CREATE, status);

export const failedToRevokeApiKey = (status: number | undefined) => explain(API_KEY_REVOKE, status);

const INVITE_USE: Record<number, string> = {
  404: "This invite has already been used, was revoked, or never existed.",
  410: "This invite has expired. Ask the Owner to send a new one.",
};

export const failedToLoadInvite = (status: number | undefined) => explain(INVITE_USE, status);

export const failedToAcceptInvite = (status: number | undefined) => explain(INVITE_USE, status);
