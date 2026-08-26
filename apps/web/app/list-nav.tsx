import Link from "next/link";
import { HOME, JOBS } from "../lib/routes";
import { buttonVariants } from "../components/ui/button";

/**
 * Documents | Jobs — the navigation the list-level pages share.
 *
 * The editor's top bar does not use this. A job view is reached from here,
 * or landed on directly after submission.
 */
export function ListNav({ current }: { current: "documents" | "jobs" }) {
  return (
    <nav className="flex gap-1" aria-label="Pages">
      <Link
        href={HOME}
        aria-current={current === "documents" ? "page" : undefined}
        className={buttonVariants({
          variant: current === "documents" ? "secondary" : "ghost",
          size: "sm",
        })}
      >
        Documents
      </Link>
      <Link
        href={JOBS}
        aria-current={current === "jobs" ? "page" : undefined}
        className={buttonVariants({
          variant: current === "jobs" ? "secondary" : "ghost",
          size: "sm",
        })}
      >
        Jobs
      </Link>
    </nav>
  );
}
