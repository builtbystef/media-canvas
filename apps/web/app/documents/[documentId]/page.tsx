import { getDocument } from "@media-canvas/api-client";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { WORKSPACE_COOKIE, chosenMembership, mayChangeDocuments } from "../../../lib/workspaces";
import { EditorSession } from "./editor-session";

export const metadata = { title: "Editor — Media Canvas" };

/**
 * The editor, at the document's own url — one page for both kinds.
 *
 * The page fetches the stored document. The session migrates it, holds undo,
 * and autosaves against the Revision the fetch loaded.
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

  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  const mayEdit = chosen !== null && mayChangeDocuments(chosen.role);
  const promotedFrom = await loadPromotedFrom(document.promotedFromId);

  return (
    <EditorSession
      loaded={document}
      workspaceId={chosen?.workspace.id ?? null}
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
