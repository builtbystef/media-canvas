import { getDocument, getJob } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { snapshotLine } from "../../../lib/job-view";
import { WORKSPACE_COOKIE, chosenMembership, membershipIn } from "../../../lib/workspaces";
import { Shell } from "../../shell";
import { JobView } from "./job-view";

export const metadata = { title: "Job — Media Canvas" };

/**
 * One Generation Job, reached by its id.
 *
 * The api answers alike for a job that is gone and one in a Workspace this
 * caller is not in, so that ids cannot be probed. So does this page. Any
 * member of the job's Workspace may open it, a Viewer included. The template
 * is fetched once here, never on a refresh, so the snapshot line is a fact
 * about the moment the page opened.
 */
export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const identity = await signedInOrSignIn();
  const { jobId } = await params;
  const { data: job } = await getJob({
    ...(await asThisCaller()),
    path: { jobId },
  });
  if (job === undefined) notFound();

  const { data: template } = await getDocument({
    ...(await asThisCaller()),
    path: { documentId: job.templateId },
  });
  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  const jobMembership =
    template !== undefined ? membershipIn(identity, template.workspaceId) : chosen;
  const canEnd = jobMembership !== null && jobMembership.role !== "viewer";
  const snapshot = snapshotLine(
    template === undefined ? null : { updatedAt: template.updatedAt },
    job.createdAt,
  );
  const view = (
    <JobView
      initial={job}
      templateName={template?.name ?? null}
      snapshot={snapshot}
      canEnd={canEnd}
    />
  );
  if (chosen === null) return view;

  return (
    <Shell memberships={identity.memberships} current={chosen}>
      {view}
    </Shell>
  );
}
