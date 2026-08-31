import type { ReactNode } from "react";
import { LogoMark, LogoWordmark } from "./logo";

/**
 * Full-viewport two-panel layout for the screens outside the app shell: the
 * form on the left, the brand panel on the right. The panel folds away below
 * `lg`, leaving the form alone on a narrow screen.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col gap-10 bg-background px-6 py-10 sm:px-12 lg:px-16">
        <LogoWordmark className="h-12 w-auto self-start text-foreground" title="Media Canvas" />
        <div className="flex flex-1 items-center justify-center pb-10">
          <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
        </div>
      </div>
      <BrandPanel />
    </main>
  );
}

/*
 * A brand surface rather than a themed one: it holds the logo's royal blue in
 * both color schemes, so the mark and the white type on it stay as drawn.
 */
function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-end overflow-hidden bg-[#0B2F7D] p-12 text-white lg:flex xl:p-16">
      <div className="absolute inset-0 bg-radial-[at_75%_15%] from-white/20 to-transparent to-70%" />
      <LogoMark className="pointer-events-none absolute top-12 right-12 h-40 w-auto opacity-15 grayscale xl:top-16 xl:right-16" />
      <div className="relative flex flex-col gap-3">
        <p className="max-w-md text-balance font-heading text-3xl leading-tight font-semibold">
          Design once. Generate thousands.
        </p>
        <p className="max-w-md text-balance text-sm text-white/75">
          Promote a design to a template, declare its variables, and render a whole batch — from the
          editor, a data file, or the API.
        </p>
      </div>
    </div>
  );
}

/** The title and standfirst at the top of an auth screen's form panel. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
      {children === undefined ? null : (
        <p className="text-balance text-sm text-muted-foreground">{children}</p>
      )}
    </div>
  );
}
