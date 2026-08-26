import type {
  JobState,
  OutputFormat,
  Progress,
  RowStatus,
  RowView,
} from "@media-canvas/api-client";

/**
 * The job view's numbers, derived from one response.
 *
 * Progress is always read off the counts the server just returned. Adding this
 * refresh to the last one is how a missed or reordered poll would lie.
 */

export function progressOf(progress: Progress) {
  const finished = progress.succeeded + progress.failed + progress.skipped;
  const remaining = progress.queued + progress.rendering;
  return {
    finished,
    total: finished + remaining,
    succeeded: progress.succeeded,
    failed: progress.failed,
    skipped: progress.skipped,
    remaining,
  };
}

/** How often a live job is asked for again. Terminal jobs are not asked. */
export const JOB_REFRESH_MS = 2000;

const LIVE: ReadonlySet<JobState> = new Set(["queued", "rendering"]);

/** The wait until the next request, or `null` once the job has ended. */
export function nextJobRefreshIn(state: JobState): number | null {
  return LIVE.has(state) ? JOB_REFRESH_MS : null;
}

/**
 * Fetch, then wait, until a response is terminal.
 *
 * `wait` is how time is controlled: the page hands it `setTimeout`, the tests
 * hand it fake timers. The loop issues no request after a terminal state.
 */
export async function runJobRefreshLoop(
  load: () => Promise<JobState>,
  wait: (ms: number) => Promise<void>,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  while (!isCancelled()) {
    const state = await load();
    const delay = nextJobRefreshIn(state);
    if (delay === null) return;
    await wait(delay);
  }
}

/** The chips above the list, in the order they are offered. */
export const ROW_FILTERS = ["all", "succeeded", "failed", "skipped", "queued"] as const;

export type RowFilter = (typeof ROW_FILTERS)[number];

/** The Rows a chip leaves visible, in the order they were submitted. */
export function rowsShown(rows: readonly RowView[], filter: RowFilter): RowView[] {
  const listed = filter === "all" ? [...rows] : rows.filter((row) => row.status === filter);
  return listed.sort((a, b) => a.index - b.index);
}

/** A failed Row's error, naming the Variable at fault; nothing otherwise. */
export function rowErrorText(row: RowView): string | null {
  if (row.status !== "failed" || row.error == null) return null;
  const { message, variable } = row.error;
  return variable == null || variable === "" ? message : `${variable}: ${message}`;
}

const FILTER_LABEL: Record<RowFilter, string> = {
  all: "All",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
  queued: "Queued",
};

export function filterLabel(filter: RowFilter): string {
  return FILTER_LABEL[filter];
}

export function filterCount(filter: RowFilter, progress: Progress, total: number): number {
  return filter === "all" ? total : progress[filter];
}

const STATE_LABEL: Record<JobState, string> = {
  queued: "Queued",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

export function jobStateLabel(state: JobState): string {
  return STATE_LABEL[state];
}

const STATUS_LABEL: Record<RowStatus, string> = {
  queued: "Queued",
  rendering: "Rendering",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
};

export function rowStatusLabel(status: RowStatus): string {
  return STATUS_LABEL[status];
}

/** The output format as the page names it. */
export function outputFormatLabel(output: OutputFormat): string {
  if (output.format === "png") return `PNG ×${String(output.scale)}`;
  if (output.format === "jpeg") {
    return output.quality === undefined ? "JPEG" : `JPEG ${String(output.quality)}`;
  }
  return "PDF";
}

const TERMINAL: ReadonlySet<JobState> = new Set(["completed", "failed", "canceled"]);

/** The zip control: on only when the job has ended with at least one success. */
export type ArchiveControl = { enabled: true } | { enabled: false; reason: string };

export function archiveControl(state: JobState, succeeded: number): ArchiveControl {
  if (!TERMINAL.has(state)) {
    return { enabled: false, reason: "Available once the job has finished." };
  }
  if (succeeded < 1) {
    return { enabled: false, reason: "No succeeded Rows to download." };
  }
  return { enabled: true };
}

/** The address the job already carried, or none if this Row has no output. */
export function rowOutputHref(row: RowView): string | null {
  if (row.status !== "succeeded") return null;
  return row.url ?? null;
}

/** The contract's zip endpoint for this job — an api path, never storage. */
export function jobArchiveHref(jobId: string): string {
  return `/api/v1/jobs/${jobId}/outputs.zip`;
}
