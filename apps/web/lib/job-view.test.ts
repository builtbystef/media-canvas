import type { JobState, Progress, RowStatus, RowView } from "@media-canvas/api-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";

import {
  JOB_REFRESH_MS,
  archiveControl,
  cancelConfirmText,
  deleteConfirmText,
  filterCount,
  jobArchiveHref,
  jobEndAction,
  nextJobRefreshIn,
  outputFormatLabel,
  progressOf,
  rowErrorText,
  rowOutputHref,
  rowsShown,
  runJobRefreshLoop,
  snapshotLine,
} from "./job-view.ts";

function counts(partial: Partial<Progress>): Progress {
  return { queued: 0, rendering: 0, succeeded: 0, failed: 0, skipped: 0, ...partial };
}

test("progress is the counts this response carried, not a running total", () => {
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

test("the zip is enabled only when the job is terminal with at least one success", () => {
  const stillRendering = archiveControl("rendering", 400);
  expect(stillRendering.enabled).toBe(false);
  if (stillRendering.enabled) throw new Error("expected a reason");
  expect(stillRendering.reason.length).toBeGreaterThan(0);

  const noneSucceeded = archiveControl("completed", 0);
  expect(noneSucceeded.enabled).toBe(false);
  if (noneSucceeded.enabled) throw new Error("expected a reason");
  expect(noneSucceeded.reason.length).toBeGreaterThan(0);
  expect(noneSucceeded.reason).not.toBe(stillRendering.reason);

  expect(archiveControl("completed", 1)).toEqual({ enabled: true });
  expect(archiveControl("failed", 1)).toEqual({ enabled: true });
  expect(archiveControl("canceled", 3)).toEqual({ enabled: true });
  expect(archiveControl("queued", 0).enabled).toBe(false);
});

test("a succeeded Row links at the address the job carried, and no other Row does", () => {
  const rows: RowView[] = [
    ...Array.from({ length: 812 }, (_, index) => ({
      index,
      name: `ok-${String(index)}`,
      status: "succeeded" as const,
      url: `/api/v1/jobs/j/outputs/ok-${String(index)}.png`,
    })),
    ...Array.from({ length: 6 }, (_, offset) => ({
      index: 812 + offset,
      name: `bad-${String(offset)}`,
      status: "failed" as const,
    })),
  ];
  const hrefs = rows.map(rowOutputHref);

  expect(hrefs.filter((href) => href !== null)).toHaveLength(812);
  expect(hrefs.slice(812)).toEqual([null, null, null, null, null, null]);
  expect(hrefs[0]).toBe("/api/v1/jobs/j/outputs/ok-0.png");
  expect(rowOutputHref(row(0, "skipped"))).toBeNull();
  expect(rowOutputHref(row(0, "queued"))).toBeNull();
  expect(rowOutputHref(row(0, "rendering"))).toBeNull();
  expect(
    rowOutputHref({
      index: 1,
      name: "ghost",
      status: "failed",
      url: "/api/v1/jobs/j/outputs/ghost.png",
    }),
  ).toBeNull();
});

test("the archive points at the contract zip, never a storage URL", () => {
  expect(jobArchiveHref("job-1")).toBe("/api/v1/jobs/job-1/outputs.zip");
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

test("cancel is offered while the job is live, and delete only once it has ended", () => {
  expect(jobEndAction("queued", true)).toBe("cancel");
  expect(jobEndAction("rendering", true)).toBe("cancel");
  expect(jobEndAction("completed", true)).toBe("delete");
  expect(jobEndAction("failed", true)).toBe("delete");
  expect(jobEndAction("canceled", true)).toBe("delete");
});

test("neither cancel nor delete is offered when the caller cannot end jobs", () => {
  expect(jobEndAction("queued", false)).toBeNull();
  expect(jobEndAction("rendering", false)).toBeNull();
  expect(jobEndAction("completed", false)).toBeNull();
  expect(jobEndAction("failed", false)).toBeNull();
  expect(jobEndAction("canceled", false)).toBeNull();
});

test("the cancel confirm names the finished renders that are kept", () => {
  const text = cancelConfirmText(812);
  expect(text).toContain("812");
  expect(text).toMatch(/kept/);
  expect(text).toMatch(/skipped/);
});

test("the delete confirm names the output files it destroys", () => {
  const text = deleteConfirmText(812);
  expect(text).toContain("812");
  expect(text).toMatch(/files/);
  expect(text).toMatch(/deletes/i);
});

test("the snapshot line follows the template's state against the job's creation time", () => {
  const createdAt = "2026-08-15T07:29:16Z";

  const stale = snapshotLine({ updatedAt: "2026-08-16T00:00:00Z" }, createdAt);
  expect(stale).toMatch(/snapshot/);
  expect(stale).toMatch(/changed since/);
  expect(stale).toContain("15 Aug 2026, 07:29");

  expect(snapshotLine({ updatedAt: "2026-08-14T00:00:00Z" }, createdAt)).toBeNull();
  expect(snapshotLine({ updatedAt: createdAt }, createdAt)).toBeNull();

  const missing = snapshotLine(null, createdAt);
  expect(missing).toMatch(/no longer exists/);
  expect(missing).not.toBe(stale);
});
