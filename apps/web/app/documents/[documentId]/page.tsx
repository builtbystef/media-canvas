import { getDocument } from "@media-canvas/api-client";
import { validateDocument } from "@media-canvas/core";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { kindLabel } from "../../../lib/documents";
import { asThisCaller, signedInOrSignIn } from "../../../lib/identity";
import { HOME } from "../../../lib/routes";
import { WORKSPACE_COOKIE, chosenMembership, mayChangeDocuments } from "../../../lib/workspaces";
import { buttonVariants } from "../../../components/ui/button";
import { DocumentName } from "./document-name";
import { EditorCanvas } from "./editor-canvas";

export const metadata = { title: "Editor — Media Canvas" };

/**
 * The editor, at the document's own url — one page for both kinds.
 *
 * What this slice owns is the chrome around the canvas: the top bar, and the
 * name renamed in place. The canvas itself is the compiled document (n5csrl),
 * and the stage below is the space it lands in.
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
  const mayRename = chosen !== null && mayChangeDocuments(chosen.role);

  return (
    <div className="w-[min(64rem,100%)] self-start">
      <header className="flex items-center gap-3 border-b pb-4">
        <Link href={HOME} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Documents
        </Link>
        {mayRename ? (
          <DocumentName loaded={document} />
        ) : (
          <span className="text-sm font-medium">{document.name}</span>
        )}
        <span className="text-xs text-muted-foreground">{kindLabel(document.kind)}</span>
        <span className="flex-1" />
      </header>
      <EditorCanvas
        documentId={documentId}
        workspaceId={chosen?.workspace.id ?? null}
        stored={document.document}
        valid={validateDocument(document.document).length === 0}
      />
    </div>
  );
}
