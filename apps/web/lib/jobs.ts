import type { JobState, Progress } from "@media-canvas/api-client";

import { nextJobRefreshIn, progressOf } from "./job-view.ts";

export const JOBS_LIST_REFRESH_MS = 5000;

export function nextJobsListRefreshIn(states: readonly JobState[]): number | null {
  return states.some((state) => nextJobRefreshIn(state) !== null) ? JOBS_LIST_REFRESH_MS : null;
}

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

export function jobProgressFraction(progress: Progress): string {
  const shown = progressOf(progress);
  return `${String(shown.finished)}/${String(shown.total)}`;
}

export function jobFailedCount(progress: Progress): number | null {
  return progress.failed > 0 ? progress.failed : null;
}
