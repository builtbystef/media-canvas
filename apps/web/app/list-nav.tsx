import Link from "next/link";
import { HOME, JOBS, SETTINGS } from "../lib/routes";
import { buttonVariants } from "../components/ui/button";

export function ListNav({ current }: { current: "documents" | "jobs" | "settings" }) {
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
      <Link
        href={SETTINGS}
        aria-current={current === "settings" ? "page" : undefined}
        className={buttonVariants({
          variant: current === "settings" ? "secondary" : "ghost",
          size: "sm",
        })}
      >
        Settings
      </Link>
    </nav>
  );
}
