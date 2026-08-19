"use client";

import type { MembershipView } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { rememberedWorkspace } from "../lib/workspaces";

/**
 * Which Workspace the shell is showing, and how to show another one.
 *
 * The choice is written as a cookie and the route is then asked again: every
 * page reads its Workspace on the server, so the switch has to be part of the
 * next request rather than something the browser keeps to itself. That is
 * also what makes the choice survive a reload — it is already in the request.
 */
export function WorkspaceSwitcher({
  memberships,
  current,
}: {
  memberships: MembershipView[];
  current: string;
}) {
  const router = useRouter();

  function switchTo(workspaceId: string) {
    document.cookie = rememberedWorkspace(workspaceId);
    router.refresh();
  }

  return (
    <label className="switcher">
      <span className="visually-hidden">Workspace</span>
      <select name="workspace" value={current} onChange={(event) => switchTo(event.target.value)}>
        {memberships.map(({ workspace }) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}
