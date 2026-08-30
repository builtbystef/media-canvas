import type { Tab } from "./documents";

export const HOME = "/";
export const SIGN_IN = "/sign-in";
export const NEW_WORKSPACE = "/workspaces/new";
export const JOBS = "/jobs";
export const SETTINGS = "/settings";

export const editorPath = (documentId: string) => `/documents/${documentId}`;

export const jobPath = (jobId: string) => `/jobs/${jobId}`;

export const listPath = (tab: Tab) => (tab === "all" ? HOME : `${HOME}?tab=${tab}`);
