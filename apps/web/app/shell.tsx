import type { MembershipView } from "@media-canvas/api-client";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOME, NEW_WORKSPACE } from "../lib/routes";
import { LogoMark } from "../components/logo";
import { buttonVariants } from "../components/ui/button";
import { ListNav, type ListNavPage } from "./list-nav";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function Shell({
  memberships,
  current,
  page,
  children,
}: {
  memberships: MembershipView[];
  current: MembershipView;
  page?: ListNavPage;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link
            href={HOME}
            aria-label="Media Canvas home"
            className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <LogoMark className="h-5 w-auto" />
            <span className="font-heading text-sm font-semibold tracking-tight max-sm:hidden">
              Media Canvas
            </span>
          </Link>
          <WorkspaceSwitcher memberships={memberships} current={current.workspace.id} />
          <span className="flex-1" />
          <Link href={NEW_WORKSPACE} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            New workspace
          </Link>
          <SignOutButton />
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <ListNav current={page} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
