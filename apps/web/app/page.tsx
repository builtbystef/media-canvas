import { listDocuments } from "@media-canvas/api-client";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TABS, kindLabel, kindShown, tabNamed, updatedLabel } from "../lib/documents";
import { asThisCaller, signedInOrSignIn } from "../lib/identity";
import { NEW_WORKSPACE, editorPath, listPath } from "../lib/routes";
import { WORKSPACE_COOKIE, chosenMembership, mayChangeDocuments } from "../lib/workspaces";
import { Problem } from "../components/problem";
import { buttonVariants } from "../components/ui/button";
import { DocumentActions } from "./document-actions";
import { NewDesign } from "./new-design";
import { Shell } from "./shell";

/**
 * The product's front door: the documents of the Workspace you are in.
 *
 * Designs and templates are one list with one row shape, because opening
 * either is one code path. The tabs filter by asking the api for a kind; the
 * order is the api's too — last update, newest first — so there is one place
 * "newest first" is decided.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const identity = await signedInOrSignIn();
  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
  // Somebody in no Workspace has nothing to list, and one screen changes that.
  if (chosen === null) redirect(NEW_WORKSPACE);

  const asked = (await searchParams).tab;
  const tab = tabNamed(typeof asked === "string" ? asked : undefined);
  const { data: documents } = await listDocuments({
    ...(await asThisCaller()),
    path: { workspaceId: chosen.workspace.id },
    query: { kind: kindShown(tab) },
  });
  const mayChange = mayChangeDocuments(chosen.role);
  const now = new Date();

  return (
    <Shell memberships={identity.memberships} current={chosen}>
      <main className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-heading text-xl font-semibold">Documents</h1>
          {mayChange && <NewDesign workspaceId={chosen.workspace.id} />}
        </div>
        <nav className="mt-3 flex gap-1">
          {TABS.map(({ tab: named, label }) => (
            <Link
              key={named}
              href={listPath(named)}
              aria-current={named === tab ? "page" : undefined}
              className={buttonVariants({
                variant: named === tab ? "secondary" : "ghost",
                size: "sm",
              })}
            >
              {label}
            </Link>
          ))}
        </nav>
        {documents === undefined ? (
          <Problem
            className="mt-4"
            message="These documents could not be loaded. Reload the page to try again."
          />
        ) : documents.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {tab === "templates"
              ? "No templates yet. A template is made by promoting a design."
              : "Nothing here yet."}
          </p>
        ) : (
          <ul className="mt-3">
            {documents.map((row) => (
              <li key={row.id} className="flex items-center gap-4 border-t py-3">
                <Link
                  href={editorPath(row.id)}
                  className="flex-1 text-sm font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <span className="text-xs text-muted-foreground">{kindLabel(row.kind)}</span>
                <span className="text-xs text-muted-foreground">
                  {updatedLabel(row.updatedAt, now)}
                </span>
                {mayChange && <DocumentActions row={row} />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}
