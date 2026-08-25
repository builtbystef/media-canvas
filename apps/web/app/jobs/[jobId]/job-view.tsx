"use client";

import { getJob, type JobView as Job, type RowView } from "@media-canvas/api-client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import {
  ROW_FILTERS,
  filterCount,
  filterLabel,
  jobStateLabel,
  nextJobRefreshIn,
  outputFormatLabel,
  progressOf,
  rowErrorText,
  rowStatusLabel,
  rowsShown,
  runJobRefreshLoop,
  type RowFilter,
} from "../../../lib/job-view";
import { Button } from "../../../components/ui/button";

/**
 * Live progress and the Row list for one Generation Job.
 *
 * The page that mounts this has already loaded the job once. This keeps
 * asking every two seconds while anything is left to render, and goes quiet
 * the moment a response is terminal. Counts are always the ones that response
 * carried — never a total built across refreshes.
 */
export function JobView({ initial, templateName }: { initial: Job; templateName: string | null }) {
  const [job, setJob] = useState(initial);
  const [filter, setFilter] = useState<RowFilter>("all");
  const latest = useRef(job);
  latest.current = job;

  useEffect(() => {
    const ac = new AbortController();
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

    return () => ac.abort();
  }, [initial.id, initial.state]);

  const shown = progressOf(job.progress);
  const listed = rowsShown(job.rows, filter);

  return (
    <main className="mt-6">
      <h1 className="font-heading text-xl font-semibold">{templateName ?? "Generation Job"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {jobStateLabel(job.state)} · {outputFormatLabel(job.output)}
      </p>
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
                <span className="text-sm font-medium">{row.name}</span>
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
