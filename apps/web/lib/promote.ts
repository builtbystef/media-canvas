import { promoteDocument, type DocumentView } from "@media-canvas/api-client";
import { failedToPromoteDocument } from "./failures";
import { editorPath } from "./routes";

export type PromoteResult =
  | { ok: true; document: DocumentView; path: string }
  | { ok: false; message: string };

export type PromoteCall = (options: { path: { documentId: string } }) => Promise<{
  data?: DocumentView;
  error?: unknown;
  response?: { status?: number };
}>;

/**
 * The one promote: copy the design, then open the template.
 *
 * The list row and the editor top bar both land here, so a naming dialog
 * cannot grow on one side and not the other. The name is the design's; rename
 * happens in the editor afterwards.
 */
export async function promoteToTemplate(
  documentId: string,
  promote: PromoteCall = promoteDocument,
): Promise<PromoteResult> {
  const { data, error, response } = await promote({ path: { documentId } });
  if (error !== undefined || data === undefined) {
    return { ok: false, message: failedToPromoteDocument(response?.status) };
  }
  return { ok: true, document: data, path: editorPath(data.id) };
}
