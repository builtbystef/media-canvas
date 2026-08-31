import type {
  JobState,
  OutputFormat,
  Progress,
  RowStatus,
  RowView,
} from "@media-canvas/api-client";

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

export const JOB_REFRESH_MS = 2000;

const LIVE: ReadonlySet<JobState> = new Set(["queued", "rendering"]);

export function nextJobRefreshIn(state: JobState): number | null {
  return LIVE.has(state) ? JOB_REFRESH_MS : null;
}

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

export const ROW_FILTERS = ["all", "succeeded", "failed", "skipped", "queued"] as const;

export type RowFilter = (typeof ROW_FILTERS)[number];

export function rowsShown(rows: readonly RowView[], filter: RowFilter): RowView[] {
  const listed = filter === "all" ? [...rows] : rows.filter((row) => row.status === filter);
  return listed.sort((a, b) => a.index - b.index);
}

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

const STATE_BADGE: Record<
  JobState,
  "default" | "secondary" | "outline" | "success" | "destructive"
> = {
  queued: "secondary",
  rendering: "default",
  completed: "success",
  failed: "destructive",
  canceled: "outline",
};

export function jobStateBadgeVariant(state: JobState) {
  return STATE_BADGE[state];
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

export function outputFormatLabel(output: OutputFormat): string {
  if (output.format === "png") return `PNG ×${String(output.scale)}`;
  if (output.format === "jpeg") {
    return output.quality === undefined ? "JPEG" : `JPEG ${String(output.quality)}`;
  }
  return "PDF";
}

const TERMINAL: ReadonlySet<JobState> = new Set(["completed", "failed", "canceled"]);

export type JobEndAction = "cancel" | "delete";

export function jobEndAction(state: JobState, canEnd: boolean): JobEndAction | null {
  if (!canEnd) return null;
  return LIVE.has(state) ? "cancel" : "delete";
}

export function cancelConfirmText(succeeded: number): string {
  return `Stops rendering; the ${String(succeeded)} finished renders are kept, the rest become skipped.`;
}

export function deleteConfirmText(succeeded: number): string {
  return `Permanently deletes this job and its ${String(succeeded)} output files.`;
}

const snapshotTakenAt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

export function snapshotLine(
  template: { updatedAt: string } | null,
  jobCreatedAt: string,
): string | null {
  if (template === null) return "The template no longer exists.";
  if (new Date(template.updatedAt).getTime() <= new Date(jobCreatedAt).getTime()) {
    return null;
  }
  return `Rendered from a snapshot taken at ${snapshotTakenAt.format(new Date(jobCreatedAt))}; the template has changed since.`;
}

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

export function rowOutputHref(row: RowView): string | null {
  if (row.status !== "succeeded") return null;
  return row.url ?? null;
}

export function jobArchiveHref(jobId: string): string {
  return `/api/v1/jobs/${jobId}/outputs.zip`;
}
