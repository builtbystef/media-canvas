import { listDocuments } from "@media-canvas/api-client";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TABS, kindLabel, kindShown, tabNamed, updatedLabel } from "../lib/documents";
import { asThisCaller, signedInOrSignIn } from "../lib/identity";
import { NEW_WORKSPACE, editorPath, listPath } from "../lib/routes";
import { WORKSPACE_COOKIE, chosenMembership, mayChangeDocuments } from "../lib/workspaces";
import { LayoutTemplate, Shapes } from "lucide-react";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/empty-state";
import { Problem } from "../components/problem";
import { Badge } from "../components/ui/badge";
import { DocumentActions } from "./document-actions";
import { NewDesign } from "./new-design";
import { Shell } from "./shell";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const identity = await signedInOrSignIn();
  const chosen = chosenMembership(identity, (await cookies()).get(WORKSPACE_COOKIE)?.value);
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
    <Shell memberships={identity.memberships} current={chosen} page="documents">
      <main>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Designs, and the templates promoted from them.
            </p>
          </div>
          {mayChange && <NewDesign workspaceId={chosen.workspace.id} />}
        </div>
        <nav className="mt-6 inline-flex rounded-lg bg-muted p-0.5" aria-label="Document kinds">
          {TABS.map(({ tab: named, label }) => (
            <Link
              key={named}
              href={listPath(named)}
              aria-current={named === tab ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                named === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {documents === undefined ? (
          <Problem
            className="mt-6"
            message="These documents could not be loaded. Reload the page to try again."
          />
        ) : documents.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={tab === "templates" ? <LayoutTemplate /> : <Shapes />}
            title={tab === "templates" ? "No templates yet" : "No documents yet"}
            description={
              tab === "templates"
                ? "A template is made by promoting a design, and is what a Generation Job renders in bulk."
                : mayChange
                  ? "Create your first design and it will show up here."
                  : "Documents created in this workspace will show up here."
            }
          />
        ) : (
          <ul className="mt-4 divide-y overflow-hidden rounded-xl border">
            {documents.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-4 bg-card px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <Link
                  href={editorPath(row.id)}
                  className="flex-1 truncate text-sm font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <Badge variant={row.kind === "template" ? "default" : "outline"}>
                  {kindLabel(row.kind)}
                </Badge>
                <span className="w-24 text-right text-xs text-muted-foreground max-sm:hidden">
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
