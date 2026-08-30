import type { DocumentKind } from "@media-canvas/api-client";

export type Tab = "all" | "designs" | "templates";

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

export function tabNamed(asked: string | undefined): Tab {
  return TABS.find(({ tab }) => tab === asked)?.tab ?? "all";
}

export function kindShown(tab: Tab): DocumentKind | undefined {
  return KIND_SHOWN[tab];
}

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
