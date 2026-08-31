"use client";

import { listJobs, type JobSummary } from "@media-canvas/api-client";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { updatedLabel } from "../../lib/documents";
import { EmptyState } from "../../components/empty-state";
import { Badge } from "../../components/ui/badge";
import {
  jobFailedCount,
  jobProgressFraction,
  nextJobsListRefreshIn,
  runJobsListRefreshLoop,
} from "../../lib/jobs";
import { jobStateBadgeVariant, jobStateLabel, outputFormatLabel } from "../../lib/job-view";
import { jobPath } from "../../lib/routes";

export function JobsList({
  initial,
  workspaceId,
  now: loaded,
}: {
  initial: JobSummary[];
  workspaceId: string;
  now: string;
}) {
  const [jobs, setJobs] = useState(initial);
  const [now, setNow] = useState(() => new Date(loaded));
  const latest = useRef(jobs);
  latest.current = jobs;

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
      const first = nextJobsListRefreshIn(initial.map((job) => job.state));
      if (first === null) return;
      await wait(first);
      if (ac.signal.aborted) return;
      await runJobsListRefreshLoop(
        async () => {
          const { data } = await listJobs({ path: { workspaceId } });
          if (ac.signal.aborted) return latest.current.map((job) => job.state);
          if (data === undefined) return latest.current.map((job) => job.state);
          setJobs(data);
          setNow(new Date());
          return data.map((job) => job.state);
        },
        wait,
        () => ac.signal.aborted,
      );
    })();

    return () => ac.abort();
  }, [initial, workspaceId]);

  if (jobs.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon={<ListChecks />}
        title="No jobs yet"
        description="Open a template in the editor and choose Generate to start a Generation Job."
      />
    );
  }

  return (
    <ul className="mt-6 divide-y overflow-hidden rounded-xl border">
      {jobs.map((job) => {
        const failed = jobFailedCount(job.progress);
        return (
          <li
            key={job.id}
            className="flex items-center gap-4 bg-card px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <Link
              href={jobPath(job.id)}
              className="flex-1 truncate text-sm font-medium hover:underline"
            >
              {job.templateName ?? "Generation Job"}
            </Link>
            <Badge variant={jobStateBadgeVariant(job.state)}>{jobStateLabel(job.state)}</Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {jobProgressFraction(job.progress)}
              {failed === null ? "" : ` · ${String(failed)} failed`}
            </span>
            <span className="w-10 text-xs text-muted-foreground max-sm:hidden">
              {outputFormatLabel(job.output)}
            </span>
            <span className="w-24 text-right text-xs text-muted-foreground max-sm:hidden">
              {updatedLabel(job.createdAt, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
