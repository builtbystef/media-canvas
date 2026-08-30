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

export function WorkspaceSwitcher({
  memberships,
  current,
}: {
  memberships: MembershipView[];
  current: string;
}) {
  const router = useRouter();

  function switchTo(workspaceId: string | null) {
    if (workspaceId === null) return;
    document.cookie = rememberedWorkspace(workspaceId);
    router.refresh();
  }

  return (
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
