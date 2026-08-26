import { getDocument } from "@media-canvas/api-client";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { mayChangeDocuments, membershipIn } from "../../../lib/workspaces";
import { EditorSession } from "./editor-session";

export const metadata = { title: "Editor — Media Canvas" };

/**
 * The editor, at the document's own url — one page for both kinds.
 *
 * The page fetches the stored document. The session migrates it, holds undo,
 * and autosaves against the Revision the fetch loaded. What the editor offers
 * is decided by the Role in the Workspace the document belongs to, not by
 * whichever Workspace the shell is switched to.
 */
export default async function EditorPage({ params }: { params: Promise<{ documentId: string }> }) {
  const identity = await signedInOrSignIn();
  const { documentId } = await params;
  const { data: document } = await getDocument({
    ...(await asThisCaller()),
    path: { documentId },
  });
  // The api answers alike for a document that is gone and one in a Workspace
  // this caller is not in, so that ids cannot be probed. So does this page.
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
