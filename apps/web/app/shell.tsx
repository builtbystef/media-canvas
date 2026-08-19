import type { MembershipView } from "@media-canvas/api-client";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOME, NEW_WORKSPACE } from "../lib/routes";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The frame every signed-in page is inside: the product's name, the Workspace
 * being read, and the way out.
 *
 * Light and dark are the system's — the tokens in `globals.css` follow
 * `prefers-color-scheme` and there is no toggle. The canvas is not part of
 * this frame: a document paints its own background, in either theme.
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
    <div className="shell">
      <header className="bar">
        <Link href={HOME} className="wordmark">
          Media Canvas
        </Link>
        <WorkspaceSwitcher memberships={memberships} current={current.workspace.id} />
        <span className="spacer" />
        <Link href={NEW_WORKSPACE}>New workspace</Link>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
