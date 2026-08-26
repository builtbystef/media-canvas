import type { JobState, Progress } from "@media-canvas/api-client";

import { nextJobRefreshIn, progressOf } from "./job-view.ts";

/**
 * The Jobs page's numbers and its refresh.
 *
 * Progress is always read off the counts the server just returned. The list
 * asks again every five seconds while any listed job is still moving, and
 * issues no request once every listed job is terminal.
 */

/** How often a live list is asked for again. An all-terminal list is not asked. */
export const JOBS_LIST_REFRESH_MS = 5000;

/** The wait until the next request, or `null` once every listed job has ended. */
export function nextJobsListRefreshIn(states: readonly JobState[]): number | null {
  return states.some((state) => nextJobRefreshIn(state) !== null) ? JOBS_LIST_REFRESH_MS : null;
}

/**
 * Fetch, then wait, until a response is all-terminal.
 *
 * `wait` is how time is controlled: the page hands it `setTimeout`, the tests
 * hand it fake timers. The loop issues no request after every listed job ends.
 */
export async function runJobsListRefreshLoop(
  load: () => Promise<readonly JobState[]>,
  wait: (ms: number) => Promise<void>,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  while (!isCancelled()) {
    const states = await load();
    const delay = nextJobsListRefreshIn(states);
    if (delay === null) return;
    await wait(delay);
  }
}

/** Finished over total, as the list writes it. */
export function jobProgressFraction(progress: Progress): string {
  const shown = progressOf(progress);
  return `${String(shown.finished)}/${String(shown.total)}`;
}

/** The failed count when it is worth showing, otherwise nothing. */
export function jobFailedCount(progress: Progress): number | null {
  return progress.failed > 0 ? progress.failed : null;
}
