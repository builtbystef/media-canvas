import { cn } from "../lib/utils";

export function Problem({ message, className }: { message: string | null; className?: string }) {
  return (
    <p role="alert" className={cn("text-sm text-destructive empty:hidden", className)}>
      {message}
    </p>
  );
}
