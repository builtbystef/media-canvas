import type { DocumentKind } from "@media-canvas/api-client";

/**
 * The list, in words: which documents a tab asks for, and what one row says.
 *
 * Designs and templates are one list with one row shape, because opening
 * either is one code path. The filtering is the api's `kind` query rather than
 * a rule applied to rows after they arrive — there is one place a tab can be
 * wrong that way, not two.
 */

export type Tab = "all" | "designs" | "templates";

/** The tabs, in the order they are offered. */
export const TABS: readonly { tab: Tab; label: string }[] = [
  { tab: "all", label: "All" },
  { tab: "designs", label: "Designs" },
  { tab: "templates", label: "Templates" },
];

const KIND_SHOWN: Record<Tab, DocumentKind | undefined> = {
  all: undefined,
  designs: "design",
  templates: "template",
};

const KIND_LABEL: Record<DocumentKind, string> = {
  design: "Design",
  template: "Template",
};

/** The tab a url asks for; anything else is the tab that hides nothing. */
export function tabNamed(asked: string | undefined): Tab {
  return TABS.find(({ tab }) => tab === asked)?.tab ?? "all";
}

/** The one kind this tab is about, or every kind. */
export function kindShown(tab: Tab): DocumentKind | undefined {
  return KIND_SHOWN[tab];
}

/** A document's kind, as a row says it. */
export function kindLabel(kind: DocumentKind): string {
  return KIND_LABEL[kind];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string) =>
  `${String(count)} ${unit}${count === 1 ? "" : "s"} ago`;

const onThatDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * When a document was last saved, as somebody would say it.
 *
 * Recent work is a list of ages — that is what "newest first" is read against
 * — and anything old enough for the age to stop meaning something is a date.
 * `now` is a parameter so that the answer is the same every time it is asked.
 */
export function updatedLabel(updatedAt: string, now: Date): string {
  const since = now.getTime() - new Date(updatedAt).getTime();
  if (since < MINUTE) return "just now";
  if (since < HOUR) return plural(Math.floor(since / MINUTE), "minute");
  if (since < DAY) return plural(Math.floor(since / HOUR), "hour");
  const days = Math.floor(since / DAY);
  if (days === 1) return "yesterday";
  if (days < 30) return plural(days, "day");
  return onThatDay.format(new Date(updatedAt));
}
