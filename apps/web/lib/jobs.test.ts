import type { JobState, Progress } from "@media-canvas/api-client";
import { afterEach, expect, test, vi } from "vitest";

import { JOBS } from "./routes.ts";
import {
  JOBS_LIST_REFRESH_MS,
  jobFailedCount,
  jobProgressFraction,
  nextJobsListRefreshIn,
  runJobsListRefreshLoop,
} from "./jobs.ts";

/**
 * The Jobs page's numbers and its refresh, as pure functions.
 *
 * The list polls every five seconds while any listed job is still moving, and
 * goes quiet the moment every listed job is terminal. Progress is a fraction
 * read off the counts this response carried, with the failed count shown only
 * when it is above zero.
 */

function counts(partial: Partial<Progress>): Progress {
  return { queued: 0, rendering: 0, succeeded: 0, failed: 0, skipped: 0, ...partial };
}

test("a list with a live job is refreshed every five seconds, and an all-terminal list is not", () => {
  expect(nextJobsListRefreshIn(["queued"])).toBe(JOBS_LIST_REFRESH_MS);
  expect(nextJobsListRefreshIn(["rendering"])).toBe(JOBS_LIST_REFRESH_MS);
  expect(nextJobsListRefreshIn(["completed", "rendering"])).toBe(JOBS_LIST_REFRESH_MS);
  expect(nextJobsListRefreshIn(["completed"])).toBeNull();
  expect(nextJobsListRefreshIn(["failed", "canceled", "completed"])).toBeNull();
  expect(nextJobsListRefreshIn([])).toBeNull();
  expect(JOBS_LIST_REFRESH_MS).toBe(5000);
});

afterEach(() => {
  vi.useRealTimers();
});

test("the last rendering job reporting completed issues no further request", async () => {
  vi.useFakeTimers();
  const sequence: JobState[][] = [
    ["completed", "rendering"],
    ["completed", "completed"],
    ["completed", "completed"],
  ];
  const load = vi.fn(async (): Promise<JobState[]> => {
    const next = sequence.shift();
    if (next === undefined) throw new Error("no further refresh was supposed to run");
    return next;
  });

  const done = runJobsListRefreshLoop(
    load,
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  );

  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(10_000);
  expect(load).toHaveBeenCalledTimes(2);

  await done;
});

test("progress is a fraction, and the failed count is shown only when it is above zero", () => {
  // 1000 Rows: 812 succeeded, 6 failed, 0 skipped → 818/1000, and the failed
  // count is shown because it is above zero.
  const withFailures = counts({ succeeded: 812, failed: 6, skipped: 0, queued: 182 });
  expect(jobProgressFraction(withFailures)).toBe("818/1000");
  expect(jobFailedCount(withFailures)).toBe(6);

  const noneFailed = counts({ succeeded: 1000, failed: 0, skipped: 0 });
  expect(jobProgressFraction(noneFailed)).toBe("1000/1000");
  expect(jobFailedCount(noneFailed)).toBeNull();
});

test("the jobs page sits beside the documents", () => {
  expect(JOBS).toBe("/jobs");
});
