import { getDocument } from "@media-canvas/api-client";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { mayChangeDocuments, membershipIn } from "../../../lib/workspaces";
import { EditorSession } from "./editor-session";

export async function generateMetadata({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const { data: document } = await getDocument({
    ...(await asThisCaller()),
    path: { documentId },
  });
  return { title: document?.name ?? "Editor" };
}

export default async function EditorPage({ params }: { params: Promise<{ documentId: string }> }) {
  const identity = await signedInOrSignIn();
  const { documentId } = await params;
  const { data: document } = await getDocument({
    ...(await asThisCaller()),
    path: { documentId },
  });
  if (document === undefined) notFound();

  const membership = membershipIn(identity, document.workspaceId);
  const mayEdit = membership !== null && mayChangeDocuments(membership.role);
  const promotedFrom = await loadPromotedFrom(document.promotedFromId);

  return (
    <EditorSession
      loaded={document}
      workspaceId={document.workspaceId}
      mayEdit={mayEdit}
      promotedFrom={promotedFrom}
    />
  );
}

async function loadPromotedFrom(
  promotedFromId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (promotedFromId === null) return null;
  const { data: source } = await getDocument({
    ...(await asThisCaller()),
    path: { documentId: promotedFromId },
  });
  return source === undefined ? null : { id: source.id, name: source.name };
}
