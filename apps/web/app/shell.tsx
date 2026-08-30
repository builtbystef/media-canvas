import type { MembershipView } from "@media-canvas/api-client";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOME, NEW_WORKSPACE } from "../lib/routes";
import { buttonVariants } from "../components/ui/button";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

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
