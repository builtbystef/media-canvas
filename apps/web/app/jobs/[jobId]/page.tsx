import { getDocument, getJob } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { snapshotLine } from "../../../lib/job-view";
import { WORKSPACE_COOKIE, chosenMembership, membershipIn } from "../../../lib/workspaces";
import { Shell } from "../../shell";
import { JobView } from "./job-view";

export const metadata = { title: "Job" };

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
  if (chosen === null) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{view}</div>;
  }

  return (
    <Shell memberships={identity.memberships} current={chosen} page="jobs">
      {view}
    </Shell>
  );
}
