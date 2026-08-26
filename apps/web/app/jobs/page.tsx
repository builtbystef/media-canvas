import { listJobs } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../lib/identity";
import { NEW_WORKSPACE } from "../../lib/routes";
import { WORKSPACE_COOKIE, chosenMembership } from "../../lib/workspaces";
import { Problem } from "../../components/problem";
import { ListNav } from "../list-nav";
import { Shell } from "../shell";
import { JobsList } from "./jobs-list";

export const metadata = { title: "Jobs — Media Canvas" };

/**
 * This Workspace's Generation Jobs, newest first.
 *
 * Any member may open the page, a Viewer included. The list is the contract's
 * unpaginated Workspace list — no per-Row detail. Switching Workspace asks
 * again for that Workspace, so a job from another one never appears.
 */
export default async function JobsPage() {
  const identity = await signedInOrSignIn();
  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  if (chosen === null) redirect(NEW_WORKSPACE);

  const { data: jobs } = await listJobs({
    ...(await asThisCaller()),
    path: { workspaceId: chosen.workspace.id },
  });
  const now = new Date();

  return (
    <Shell memberships={identity.memberships} current={chosen}>
      <main className="mt-6">
        <ListNav current="jobs" />
        <h1 className="mt-4 font-heading text-xl font-semibold">Jobs</h1>
        {jobs === undefined ? (
          <Problem
            className="mt-4"
            message="These jobs could not be loaded. Reload the page to try again."
          />
        ) : (
          <JobsList
            key={chosen.workspace.id}
            initial={jobs}
            workspaceId={chosen.workspace.id}
            now={now.toISOString()}
          />
        )}
      </main>
    </Shell>
  );
}
