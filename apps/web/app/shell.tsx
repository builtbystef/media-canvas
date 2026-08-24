import type { MembershipView } from "@media-canvas/api-client";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOME, NEW_WORKSPACE } from "../lib/routes";
import { buttonVariants } from "../components/ui/button";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The frame every signed-in page is inside: the product's name, the Workspace
 * being read, and the way out.
 *
 * Light and dark are the system's — the shadcn tokens in `globals.css` are
 * declared under `prefers-color-scheme` and there is no toggle. The canvas is
 * not part of this frame: a document paints its own background, in either
 * theme.
 */
export function Shell({
  memberships,
  current,
  children,
}: {
  memberships: MembershipView[];
  current: MembershipView;
  children: ReactNode;
}) {
  return (
    <div className="w-[min(64rem,100%)] self-start">
      <header className="flex items-center gap-3 border-b pb-4">
        <Link href={HOME} className="font-heading text-sm font-bold">
          Media Canvas
        </Link>
        <WorkspaceSwitcher memberships={memberships} current={current.workspace.id} />
        <span className="flex-1" />
        <Link href={NEW_WORKSPACE} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          New workspace
        </Link>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
