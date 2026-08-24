import { cn } from "../lib/utils";

/**
 * What went wrong, where it went wrong.
 *
 * The live region is always in the document so that a message inserted into it
 * is announced, and out of the layout while it holds nothing — `empty:hidden`
 * is what keeps an empty one from reserving space.
 */
export function Problem({ message, className }: { message: string | null; className?: string }) {
  return (
    <p role="alert" className={cn("text-sm text-destructive empty:hidden", className)}>
      {message}
    </p>
  );
}
