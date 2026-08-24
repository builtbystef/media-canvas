"use client";

import type { MembershipView } from "@media-canvas/api-client";
import { useRouter } from "next/navigation";
import { rememberedWorkspace } from "../lib/workspaces";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

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

  // Base UI reports `null` for a cleared selection; this list is never empty
  // and never clears, so nothing to switch to is nothing to do.
  function switchTo(workspaceId: string | null) {
    if (workspaceId === null) return;
    document.cookie = rememberedWorkspace(workspaceId);
    router.refresh();
  }

  return (
    // `items` is what the closed trigger reads a name off: without it Base UI
    // falls back to stringifying the value, and the value here is an id.
    <Select
      name="workspace"
      value={current}
      onValueChange={switchTo}
      items={memberships.map(({ workspace }) => ({
        value: workspace.id,
        label: workspace.name,
      }))}
    >
      <SelectTrigger size="sm" aria-label="Workspace">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {memberships.map(({ workspace }) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
