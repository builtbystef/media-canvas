"use client";

import {
  cancelJob,
  deleteJob,
  getJob,
  type JobView as Job,
  type RowView,
} from "@media-canvas/api-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { failedToEndJob } from "../../../lib/failures";
import {
  ROW_FILTERS,
  archiveControl,
  cancelConfirmText,
  deleteConfirmText,
  filterCount,
  filterLabel,
  jobArchiveHref,
  jobEndAction,
  jobStateLabel,
  nextJobRefreshIn,
  outputFormatLabel,
  progressOf,
  rowErrorText,
  rowOutputHref,
  rowStatusLabel,
  rowsShown,
  runJobRefreshLoop,
  type ArchiveControl,
  type JobEndAction,
  type RowFilter,
} from "../../../lib/job-view";
import { JOBS } from "../../../lib/routes";
import { Problem } from "../../../components/problem";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Button, buttonVariants } from "../../../components/ui/button";

export function JobView({
  initial,
  templateName,
  snapshot,
  canEnd,
}: {
  initial: Job;
  templateName: string | null;
  snapshot: string | null;
  canEnd: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [confirming, setConfirming] = useState<JobEndAction | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(job);
  latest.current = job;
  const stopRefresh = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    stopRefresh.current = ac;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        if (ac.signal.aborted) {
          resolve();
          return;
        }
        const id = setTimeout(resolve, ms);
        ac.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true },
        );
      });

    void (async () => {
      const first = nextJobRefreshIn(initial.state);
      if (first === null) return;
      await wait(first);
      if (ac.signal.aborted) return;
      await runJobRefreshLoop(
        async () => {
          const { data } = await getJob({ path: { jobId: initial.id } });
          if (ac.signal.aborted) return latest.current.state;
          if (data === undefined) return latest.current.state;
          setJob(data);
          return data.state;
        },
        wait,
        () => ac.signal.aborted,
      );
    })();

    return () => {
      ac.abort();
      if (stopRefresh.current === ac) stopRefresh.current = null;
    };
  }, [initial.id, initial.state]);

  const shown = progressOf(job.progress);
  const listed = rowsShown(job.rows, filter);
  const archive = archiveControl(job.state, job.progress.succeeded);
  const end = jobEndAction(job.state, canEnd);

  async function confirmEnd() {
    if (confirming === null) return;
    setBusy(true);
    setProblem(null);
    if (confirming === "cancel") {
      const { data, error, response } = await cancelJob({ path: { jobId: job.id } });
      setBusy(false);
      setConfirming(null);
      if (error !== undefined || data === undefined) {
        setProblem(failedToEndJob(response?.status));
        return;
      }
      stopRefresh.current?.abort();
      setJob(data);
      return;
    }
    const { error, response } = await deleteJob({ path: { jobId: job.id } });
    setBusy(false);
    setConfirming(null);
    if (error !== undefined) {
      setProblem(failedToEndJob(response?.status));
      return;
    }
    router.push(JOBS);
    router.refresh();
  }

  return (
    <main className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">{templateName ?? "Generation Job"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobStateLabel(job.state)} · {outputFormatLabel(job.output)}
          </p>
          {snapshot !== null ? (
            <p className="mt-2 text-sm text-muted-foreground">{snapshot}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {end === "cancel" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming("cancel")}
              >
                Cancel
              </Button>
            ) : null}
            {end === "delete" ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming("delete")}
              >
                Delete
              </Button>
            ) : null}
            <ArchiveDownload jobId={job.id} control={archive} />
          </div>
          <Problem message={problem} />
        </div>
      </div>
      <EndJobDialog
        action={confirming}
        succeeded={job.progress.succeeded}
        busy={busy}
        onOpenChange={(open) => !open && !busy && setConfirming(null)}
        onConfirm={() => void confirmEnd()}
      />
      <ProgressSummary shown={shown} onFailed={() => setFilter("failed")} />
      <nav className="mt-4 flex flex-wrap gap-1" aria-label="Row status">
        {ROW_FILTERS.map((named) => (
          <Button
            key={named}
            type="button"
            variant={named === filter ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(named)}
          >
            {filterLabel(named)} {filterCount(named, job.progress, shown.total)}
          </Button>
        ))}
      </nav>
      <RowList rows={listed} />
    </main>
  );
}

function EndJobDialog({
  action,
  succeeded,
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: JobEndAction | null;
  succeeded: number;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const isCancel = action === "cancel";
  return (
    <AlertDialog open={action !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isCancel ? "Cancel this job?" : "Delete this job?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isCancel ? cancelConfirmText(succeeded) : deleteConfirmText(succeeded)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {isCancel ? "Keep rendering" : "Cancel"}
          </AlertDialogCancel>
          <Button
            type="button"
            variant={isCancel ? "default" : "destructive"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (isCancel ? "Canceling…" : "Deleting…") : isCancel ? "Cancel job" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProgressSummary({
  shown,
  onFailed,
}: {
  shown: ReturnType<typeof progressOf>;
  onFailed: () => void;
}) {
  const fraction = shown.total === 0 ? 0 : (shown.finished / shown.total) * 100;
  return (
    <section className="mt-4" aria-label="Progress">
      <p className="text-sm">
        {shown.finished} of {shown.total} finished
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={shown.total}
        aria-valuenow={shown.finished}
        aria-label={`${String(shown.finished)} of ${String(shown.total)} finished`}
      >
        <div className="h-full bg-primary" style={{ width: `${String(fraction)}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>succeeded {shown.succeeded}</span>
        <button type="button" className="hover:underline" onClick={onFailed}>
          failed {shown.failed}
        </button>
        <span>skipped {shown.skipped}</span>
        <span>remaining {shown.remaining}</span>
      </p>
    </section>
  );
}

function RowList({ rows }: { rows: RowView[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="mt-3 h-[32rem] overflow-auto border-t">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;
          const error = rowErrorText(row);
          return (
            <div
              key={row.index}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full border-b px-3 py-2"
              style={{ transform: `translateY(${String(item.start)}px)` }}
            >
              <div className="flex items-baseline gap-3">
                <RowName row={row} />
                <span className="text-xs text-muted-foreground">{rowStatusLabel(row.status)}</span>
              </div>
              {error !== null ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowName({ row }: { row: RowView }) {
  const href = rowOutputHref(row);
  if (href === null) {
    return <span className="text-sm font-medium">{row.name}</span>;
  }
  return (
    <a href={href} download className="text-sm font-medium hover:underline">
      {row.name}
    </a>
  );
}

function ArchiveDownload({ jobId, control }: { jobId: string; control: ArchiveControl }) {
  if (control.enabled) {
    return (
      <a
        href={jobArchiveHref(jobId)}
        download
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Download all (.zip)
      </a>
    );
  }
  return (
    <div className="flex max-w-56 flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled>
        Download all (.zip)
      </Button>
      <p className="text-right text-xs text-muted-foreground">{control.reason}</p>
    </div>
  );
}
