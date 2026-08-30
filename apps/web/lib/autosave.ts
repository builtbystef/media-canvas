import type { DesignDocument } from "@media-canvas/core";

export const AUTOSAVE_DELAY_MS = 1_000;
export const RETRY_START_MS = 1_000;
export const RETRY_CAP_MS = 30_000;

export type SaveIndicator = "saved" | "saving" | "warning" | "conflict";

export type Autosave = {
  indicator: SaveIndicator;
  revision: number;
  name: string;
  savedName: string;
  savedDocument: DesignDocument | null;
  retryDelay: number;
  scheduledAt: number | null;
};

export function startAutosave(
  revision: number,
  document: DesignDocument | null,
  name: string,
): Autosave {
  return {
    indicator: "saved",
    revision,
    name,
    savedName: name,
    savedDocument: document,
    retryDelay: RETRY_START_MS,
    scheduledAt: null,
  };
}

export function isDirty(state: Autosave, document: DesignDocument | null): boolean {
  return document !== state.savedDocument || state.name !== state.savedName;
}

function blocked(state: Autosave): boolean {
  return state.indicator === "conflict";
}

export function noteChange(state: Autosave, _document: DesignDocument, now: number): Autosave {
  if (blocked(state)) return state;
  return { ...state, scheduledAt: now + AUTOSAVE_DELAY_MS };
}

export function requestFlush(state: Autosave, now: number): Autosave {
  if (blocked(state) || state.scheduledAt === null) return state;
  return { ...state, scheduledAt: now };
}

export function beginSave(state: Autosave): Autosave {
  if (blocked(state)) return state;
  return { ...state, indicator: "saving", scheduledAt: null };
}

export function succeedSave(
  state: Autosave,
  revision: number,
  document: DesignDocument,
  name: string,
): Autosave {
  if (blocked(state)) return state;
  return {
    indicator: "saved",
    revision,
    name,
    savedDocument: document,
    savedName: name,
    retryDelay: RETRY_START_MS,
    scheduledAt: null,
  };
}

export function failSave(state: Autosave, now: number, kind: "conflict" | "other"): Autosave {
  if (blocked(state)) return state;
  if (kind === "conflict") {
    return { ...state, indicator: "conflict", scheduledAt: null };
  }
  return {
    ...state,
    indicator: "warning",
    scheduledAt: now + state.retryDelay,
    retryDelay: Math.min(state.retryDelay * 2, RETRY_CAP_MS),
  };
}

export function noteRename(state: Autosave, name: string, now: number): Autosave {
  if (blocked(state) || name === state.name) return state;
  return { ...state, name, scheduledAt: now };
}
