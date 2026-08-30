import { expect, test } from "vitest";

import { kindLabel, kindShown, tabNamed, updatedLabel } from "./documents.ts";
import { editorPath, jobPath, listPath } from "./routes.ts";

test("the templates tab shows no designs", () => {
  expect(kindShown(tabNamed("templates"))).toBe("template");
  expect(kindShown(tabNamed("designs"))).toBe("design");
  expect(kindShown(tabNamed("all"))).toBeUndefined();
});

test("a tab nobody offers is the tab that shows everything", () => {
  expect(tabNamed(undefined)).toBe("all");
  expect(tabNamed("archived")).toBe("all");
});

test("a row says which kind it is in the product's own words", () => {
  expect(kindLabel("design")).toBe("Design");
  expect(kindLabel("template")).toBe("Template");
});

test("last update is read as an age, until it is old enough to be a date", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const ago = (iso: string) => updatedLabel(iso, now);

  expect(ago("2026-08-19T11:59:31Z")).toBe("just now");
  expect(ago("2026-08-19T11:52:00Z")).toBe("8 minutes ago");
  expect(ago("2026-08-19T11:00:00Z")).toBe("1 hour ago");
  expect(ago("2026-08-19T09:00:00Z")).toBe("3 hours ago");
  expect(ago("2026-08-18T09:00:00Z")).toBe("yesterday");
  expect(ago("2026-08-14T09:00:00Z")).toBe("5 days ago");
  expect(ago("2026-07-04T09:00:00Z")).toBe("4 Jul 2026");
});

test("a row opens its document at the document's own url", () => {
  expect(editorPath("6c8a1f4e-1d2b-4c3a-9e5f-7a8b9c0d1e2f")).toBe(
    "/documents/6c8a1f4e-1d2b-4c3a-9e5f-7a8b9c0d1e2f",
  );
  expect(listPath("all")).toBe("/");
  expect(listPath("templates")).toBe("/?tab=templates");
});

test("a job is reached at the job's own url", () => {
  expect(jobPath("6c8a1f4e-1d2b-4c3a-9e5f-7a8b9c0d1e2f")).toBe(
    "/jobs/6c8a1f4e-1d2b-4c3a-9e5f-7a8b9c0d1e2f",
  );
});
