"use client";

import { listJobs, type JobSummary } from "@media-canvas/api-client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { updatedLabel } from "../../lib/documents";
import {
  jobFailedCount,
  jobProgressFraction,
  nextJobsListRefreshIn,
  runJobsListRefreshLoop,
} from "../../lib/jobs";
import { jobStateLabel, outputFormatLabel } from "../../lib/job-view";
import { jobPath } from "../../lib/routes";

/**
 * The current Workspace's jobs, newest first.
 *
 * The page that mounts this has already loaded the list once. This keeps
 * asking every five seconds while any listed job is still moving, and goes
 * quiet the moment every listed job is terminal. An empty Workspace is a
 * plain line, not an error.
 */
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
    return <p className="mt-6 text-sm text-muted-foreground">No jobs yet.</p>;
  }

  return (
    <ul className="mt-3">
      {jobs.map((job) => {
        const failed = jobFailedCount(job.progress);
        return (
          <li key={job.id} className="flex items-center gap-4 border-t py-3">
            <Link href={jobPath(job.id)} className="flex-1 text-sm font-medium hover:underline">
              {job.templateName ?? "Generation Job"}
            </Link>
            <span className="text-xs text-muted-foreground">{jobStateLabel(job.state)}</span>
            <span className="text-xs text-muted-foreground">
              {jobProgressFraction(job.progress)}
              {failed === null ? "" : ` · ${String(failed)} failed`}
            </span>
            <span className="text-xs text-muted-foreground">{outputFormatLabel(job.output)}</span>
            <span className="text-xs text-muted-foreground">
              {updatedLabel(job.createdAt, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
