import { getDocument, getJob } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { WORKSPACE_COOKIE, chosenMembership } from "../../../lib/workspaces";
import { Shell } from "../../shell";
import { JobView } from "./job-view";

export const metadata = { title: "Job — Media Canvas" };

/**
 * One Generation Job, reached by its id.
 *
 * The api answers alike for a job that is gone and one in a Workspace this
 * caller is not in, so that ids cannot be probed. So does this page. Any
 * member of the job's Workspace may open it, a Viewer included.
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
  const view = <JobView initial={job} templateName={template?.name ?? null} />;
  if (chosen === null) return view;

  return (
    <Shell memberships={identity.memberships} current={chosen}>
      {view}
    </Shell>
  );
}
