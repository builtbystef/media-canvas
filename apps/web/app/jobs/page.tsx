import { listJobs } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../lib/identity";
import { NEW_WORKSPACE } from "../../lib/routes";
import { WORKSPACE_COOKIE, chosenMembership } from "../../lib/workspaces";
import { Problem } from "../../components/problem";
import { Shell } from "../shell";
import { JobsList } from "./jobs-list";

export const metadata = { title: "Jobs" };

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
    <Shell memberships={identity.memberships} current={chosen} page="jobs">
      <main>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A Generation Job renders a template once per Row of data.
        </p>
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
