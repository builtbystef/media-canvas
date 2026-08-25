import type { Page } from "playwright-core";
import { afterEach, expect, test } from "vitest";

import { createPagePool, PAGE_POOL_SIZE, type PagePool } from "./page-pool.ts";

let pool: PagePool | undefined;

afterEach(async () => {
  await pool?.close();
  pool = undefined;
});

function canvas(fill: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${fill}"/></svg>`
  );
}

test("the worker keeps eight pages in flight", () => {
  expect(PAGE_POOL_SIZE).toBe(8);
});

/** The pool talks to Chromium. CI's unit job does not install a browser;
 *  the in-image checks are the pinned proof. Skip rather than fail there. */
const browserTest = process.env.CI ? test.skip : test;

browserTest(
  "pages are reused across sequential renders",
  async () => {
    pool = createPagePool({ size: 1 });

    await pool.render(canvas("#CC0000"), { format: "png", scale: 1 });
    await pool.render(canvas("#00CC00"), { format: "png", scale: 1 });

    expect(pool.opened).toBe(1);
  },
  30_000,
);

browserTest(
  "a page that dies does not take the pool down",
  async () => {
    let page: Page | undefined;
    pool = createPagePool({
      size: 1,
      onPage(opened) {
        page = opened;
      },
    });

    await pool.render(canvas("#CC0000"), { format: "png", scale: 1 });
    await page?.close();
    const bytes = await pool.render(canvas("#0000CC"), { format: "png", scale: 1 });

    expect(bytes[0]).toBe(137);
    expect(pool.opened).toBe(2);
  },
  30_000,
);

browserTest(
  "concurrent renders share the pool without taking each other down",
  async () => {
    pool = createPagePool({ size: 2 });

    const [one, two] = await Promise.all([
      pool.render(canvas("#CC0000"), { format: "png", scale: 1 }),
      pool.render(canvas("#0000CC"), { format: "png", scale: 1 }),
    ]);

    expect(one[0]).toBe(137);
    expect(two[0]).toBe(137);
    expect(pool.opened).toBeLessThanOrEqual(2);
  },
  30_000,
);
