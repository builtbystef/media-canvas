import Link from "next/link";
import { HOME, JOBS, SETTINGS } from "../lib/routes";
import { cn } from "../lib/utils";

export type ListNavPage = "documents" | "jobs" | "settings";

const PAGES: { page: ListNavPage; href: string; label: string }[] = [
  { page: "documents", href: HOME, label: "Documents" },
  { page: "jobs", href: JOBS, label: "Jobs" },
  { page: "settings", href: SETTINGS, label: "Settings" },
];

export function ListNav({ current }: { current?: ListNavPage }) {
  return (
    <nav className="-mx-3 flex" aria-label="Pages">
      {PAGES.map(({ page, href, label }) => {
        const active = page === current;
        return (
          <Link
            key={page}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "border-primary text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
