import type { DesignDocument, RectElement } from "@media-canvas/core";
import { expect, test } from "vitest";
import {
  AUTOSAVE_DELAY_MS,
  RETRY_CAP_MS,
  RETRY_START_MS,
  beginSave,
  failSave,
  noteChange,
  noteRename,
  requestFlush,
  startAutosave,
  succeedSave,
} from "./autosave";

function rect(id: string, x: number): RectElement {
  return {
    id,
    type: "rect",
    x,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    visible: true,
    fill: "#000000",
  };
}

function documentWith(x: number): DesignDocument {
  return {
    schemaVersion: 1,
    canvas: { width: 100, height: 100, background: "#FFFFFF" },
    elements: [rect("one", x)],
  };
}

test("a change is due about a second later, and another change resets that wait", () => {
  const loaded = documentWith(0);
  const idle = startAutosave(4, loaded, "Untitled");
  const first = noteChange(idle, documentWith(1), 1_000);

  expect(first.indicator).toBe("saved");
  expect(first.scheduledAt).toBe(1_000 + AUTOSAVE_DELAY_MS);

  const second = noteChange(first, documentWith(2), 1_400);
  expect(second.scheduledAt).toBe(1_400 + AUTOSAVE_DELAY_MS);
});

test("a flush-now or a hidden tab is due immediately", () => {
  const loaded = documentWith(0);
  const pending = noteChange(startAutosave(1, loaded, "Untitled"), documentWith(1), 5_000);

  expect(requestFlush(pending, 5_200).scheduledAt).toBe(5_200);
});

test("a successful save shows saved and advances the revision", () => {
  const loaded = documentWith(0);
  const next = documentWith(1);
  const saving = beginSave(noteChange(startAutosave(4, loaded, "Untitled"), next, 0));
  const saved = succeedSave(saving, 5, next, "Untitled");

  expect(saving.indicator).toBe("saving");
  expect(saved.indicator).toBe("saved");
  expect(saved.revision).toBe(5);
  expect(saved.scheduledAt).toBeNull();
});

test("a non-conflict failure warns and retries with a widening delay up to the cap", () => {
  const loaded = documentWith(0);
  const next = documentWith(1);
  let state = beginSave(noteChange(startAutosave(1, loaded, "Untitled"), next, 0));

  state = failSave(state, 10_000, "other");
  expect(state.indicator).toBe("warning");
  expect(state.scheduledAt).toBe(10_000 + RETRY_START_MS);

  state = failSave(beginSave(state), 12_000, "other");
  expect(state.scheduledAt).toBe(12_000 + RETRY_START_MS * 2);

  state = failSave(beginSave(state), 20_000, "other");
  expect(state.scheduledAt).toBe(20_000 + RETRY_START_MS * 4);

  // Keep doubling past the cap: the wait itself never exceeds it.
  state = failSave(beginSave(state), 30_000, "other");
  state = failSave(beginSave(state), 40_000, "other");
  state = failSave(beginSave(state), 50_000, "other");
  expect(state.scheduledAt).toBe(50_000 + RETRY_CAP_MS);
  expect(state.indicator).toBe("warning");
});

test("a rename is due immediately and does not wait for the debounce", () => {
  const loaded = documentWith(0);
  const idle = startAutosave(1, loaded, "Untitled");
  const renamed = noteRename(idle, "Poster", 3_000);

  expect(renamed.name).toBe("Poster");
  expect(renamed.savedName).toBe("Untitled");
  expect(renamed.scheduledAt).toBe(3_000);
});

test("a conflict blocks, is not merged, and ignores every later save", () => {
  const loaded = documentWith(0);
  const next = documentWith(1);
  const conflicted = failSave(
    beginSave(noteChange(startAutosave(4, loaded, "Untitled"), next, 0)),
    8_000,
    "conflict",
  );

  expect(conflicted.indicator).toBe("conflict");
  expect(conflicted.scheduledAt).toBeNull();
  expect(conflicted.revision).toBe(4);

  expect(noteChange(conflicted, documentWith(2), 9_000)).toBe(conflicted);
  expect(requestFlush(conflicted, 9_000)).toBe(conflicted);
  expect(beginSave(conflicted)).toBe(conflicted);
  expect(succeedSave(conflicted, 9, documentWith(2), "Untitled")).toBe(conflicted);
});
