import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import { contextOptions, launchOptions, renderEnvironment } from "./environment.ts";
import { renderOnPage, type RenderOptions } from "./render.ts";

export const PAGE_POOL_SIZE = 8;

export type PagePool = {
  render(svg: string, options: RenderOptions): Promise<Uint8Array>;
  close(): Promise<void>;
  readonly opened: number;
};

type Slot = {
  context: BrowserContext;
  page: Page;
  scale: number;
};

export function createPagePool(options?: {
  size?: number;
  onPage?: (page: Page) => void;
}): PagePool {
  const size = options?.size ?? PAGE_POOL_SIZE;
  let browser: Browser | undefined;
  let closed = false;
  let opened = 0;
  const idle: Slot[] = [];
  let inFlight = 0;
  const waiters: (() => void)[] = [];

  async function lock(): Promise<void> {
    if (inFlight >= size) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    inFlight += 1;
  }

  function unlock(): void {
    inFlight -= 1;
    waiters.shift()?.();
  }

  async function openNew(owned: Browser, scale: number): Promise<Slot> {
    const slot = await openSlot(owned, scale);
    opened += 1;
    options?.onPage?.(slot.page);
    return slot;
  }

  async function acquire(scale: number): Promise<Slot> {
    await lock();
    try {
      if (closed) throw new Error("the page pool is closed");
      if (browser === undefined) {
        browser = await chromium.launch(launchOptions(renderEnvironment.browsers.render));
      }
      while (idle.length > 0) {
        const slot = idle.pop();
        if (slot === undefined || slot.page.isClosed()) {
          if (slot !== undefined) await slot.context.close().catch(() => undefined);
          continue;
        }
        if (slot.scale === scale) return slot;
        await slot.context.close().catch(() => undefined);
        return openNew(browser, scale);
      }
      return openNew(browser, scale);
    } catch (failure) {
      unlock();
      throw failure;
    }
  }

  function release(slot: Slot): void {
    if (!slot.page.isClosed()) idle.push(slot);
    else void slot.context.close().catch(() => undefined);
    unlock();
  }

  return {
    get opened() {
      return opened;
    },
    async render(svg, renderOptions) {
      const scale = renderOptions.format === "png" ? renderOptions.scale : 1;
      const slot = await acquire(scale);
      try {
        return await renderOnPage(slot.page, svg, renderOptions);
      } catch (failure) {
        if (slot.page.isClosed()) await slot.context.close().catch(() => undefined);
        throw failure;
      } finally {
        release(slot);
      }
    },
    async close() {
      closed = true;
      const held = idle.splice(0, idle.length);
      await Promise.all(held.map((slot) => slot.context.close().catch(() => undefined)));
      if (browser !== undefined) {
        await browser.close();
        browser = undefined;
      }
    },
  };
}

async function openSlot(browser: Browser, scale: number): Promise<Slot> {
  const context = await browser.newContext({
    ...contextOptions(),
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  page.on("crash", () => {
    void context.close().catch(() => undefined);
  });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("about:")) {
      return route.continue();
    }
    return route.abort("blockedbyclient");
  });
  return { context, page, scale };
}
