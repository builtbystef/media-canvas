import { defineConfig } from "@playwright/test";

function browserProxy(raw: string | undefined) {
  if (raw === undefined || raw === "") return undefined;
  const url = new URL(raw);
  const server = `${url.protocol}//${url.host}`;
  if (url.username === "") return { server };
  return {
    server,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "http://localhost",
    proxy: browserProxy(process.env.SMOKE_PROXY),
    trace: "retain-on-failure",
  },
});
