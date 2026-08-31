import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {icon !== undefined && (
        <div className="mb-3 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description !== undefined && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
