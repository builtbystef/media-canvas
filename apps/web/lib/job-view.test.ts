import type { JobState, Progress, RowStatus, RowView } from "@media-canvas/api-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";

import {
  JOB_REFRESH_MS,
  filterCount,
  nextJobRefreshIn,
  outputFormatLabel,
  progressOf,
  rowErrorText,
  rowsShown,
  runJobRefreshLoop,
} from "./job-view.ts";

/**
 * The job view's numbers and its refresh, as pure functions.
 *
 * Counts come from the payload the server just returned — never from adding
 * this refresh to the last — so a missed or reordered response cannot skew
 * them. The cadence is a delay that is either two seconds or stop-for-good.
 */

function counts(partial: Partial<Progress>): Progress {
  return { queued: 0, rendering: 0, succeeded: 0, failed: 0, skipped: 0, ...partial };
}

test("progress is the counts this response carried, not a running total", () => {
  // 1000 Rows: 812 succeeded, 6 failed, 0 skipped → 818 of 1000 finished,
  // remaining 182. The bar and the four counts are read off this object.
  const shown = progressOf(counts({ succeeded: 812, failed: 6, skipped: 0, queued: 182 }));

  expect(shown).toEqual({
    finished: 818,
    total: 1000,
    succeeded: 812,
    failed: 6,
    skipped: 0,
    remaining: 182,
  });
});

test("a live job is refreshed every two seconds, and a terminal one is not", () => {
  expect(nextJobRefreshIn("queued")).toBe(JOB_REFRESH_MS);
  expect(nextJobRefreshIn("rendering")).toBe(JOB_REFRESH_MS);
  expect(nextJobRefreshIn("completed")).toBeNull();
  expect(nextJobRefreshIn("failed")).toBeNull();
  expect(nextJobRefreshIn("canceled")).toBeNull();
  expect(JOB_REFRESH_MS).toBe(2000);
});

afterEach(() => {
  vi.useRealTimers();
});

test("a job that reports completed on its fourth refresh issues no fifth request", async () => {
  vi.useFakeTimers();
  const sequence: JobState[] = ["queued", "queued", "rendering", "completed", "completed"];
  const load = vi.fn(async (): Promise<JobState> => {
    const next = sequence.shift();
    if (next === undefined) throw new Error("no further refresh was supposed to run");
    return next;
  });

  const done = runJobRefreshLoop(load, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(3);

  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(4);

  await vi.advanceTimersByTimeAsync(10_000);
  expect(load).toHaveBeenCalledTimes(4);

  await done;
});

function row(index: number, status: RowStatus, name = `row-${String(index)}`): RowView {
  return { index, name, status };
}

test("the failed chip leaves exactly the failed Rows listed", () => {
  const rows = [
    row(0, "succeeded"),
    row(1, "failed"),
    row(2, "succeeded"),
    row(3, "failed"),
    row(4, "skipped"),
    row(5, "queued"),
    row(6, "failed"),
    row(7, "failed"),
    row(8, "failed"),
    row(9, "failed"),
  ];
  // Six failed among the ten — the chip's count is the server's, the list is
  // those six in the order they were submitted.
  const failed = rowsShown(rows, "failed");

  expect(failed).toHaveLength(6);
  expect(failed.map((listed) => listed.index)).toEqual([1, 3, 6, 7, 8, 9]);
  expect(rowsShown(rows, "all")).toHaveLength(10);
  expect(rowsShown(rows, "succeeded")).toHaveLength(2);
  expect(rowsShown(rows, "skipped")).toHaveLength(1);
  expect(rowsShown(rows, "queued")).toHaveLength(1);
});

test("only a failed Row carries its error, and the error names the Variable", () => {
  const failed: RowView = {
    index: 3,
    name: "hero",
    status: "failed",
    error: { message: "not a number", variable: "price" },
  };
  const succeeded: RowView = {
    index: 0,
    name: "ok",
    status: "succeeded",
    error: { message: "should not show", variable: "price" },
  };

  expect(rowErrorText(failed)).toMatch(/price/);
  expect(rowErrorText(failed)).toMatch(/not a number/);
  expect(rowErrorText(row(1, "queued"))).toBeNull();
  expect(rowErrorText(row(2, "skipped"))).toBeNull();
  expect(rowErrorText(succeeded)).toBeNull();
});

test("each chip carries the count this response reported for that status", () => {
  const progress = counts({ succeeded: 812, failed: 6, skipped: 0, queued: 182 });
  const { total } = progressOf(progress);

  expect(filterCount("all", progress, total)).toBe(1000);
  expect(filterCount("succeeded", progress, total)).toBe(812);
  expect(filterCount("failed", progress, total)).toBe(6);
  expect(filterCount("skipped", progress, total)).toBe(0);
  expect(filterCount("queued", progress, total)).toBe(182);
});

test("the output format is named the way the job asked for it", () => {
  expect(outputFormatLabel({ format: "png", scale: 2 })).toBe("PNG ×2");
  expect(outputFormatLabel({ format: "jpeg", quality: 90 })).toBe("JPEG 90");
  expect(outputFormatLabel({ format: "pdf" })).toBe("PDF");
});

test("the Row list virtualizes through the registry package", () => {
  expect(typeof useVirtualizer).toBe("function");
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  expect(pkg.dependencies["@tanstack/react-virtual"]).toMatch(/^(?:\d|\^|~)/);
  expect(pkg.dependencies["@tanstack/react-virtual"]).not.toMatch(/^file:/);
  expect(existsSync(join(webRoot, "vendor"))).toBe(false);
});
