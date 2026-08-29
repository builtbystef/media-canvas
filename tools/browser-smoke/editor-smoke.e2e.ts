import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * One scripted pass over the editor against the real stack. Not part of
 * `pnpm test`. Fine-grained behavior lives at the Vitest seam; this catches
 * wiring. Each `test.step` is the name a failure reports.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEXT_CONTENT = "Hello";
const VARIABLE = "headline";
const GENERATED = "Smoke";
const here = dirname(fileURLToPath(import.meta.url));

test.use({ viewport: { width: 1400, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test("the editor end-to-end smoke", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-based browsers only");

  await test.step("sign in and create a workspace", async () => {
    await signIn(page, uniqueEmail());
    await createWorkspace(page, `Editor smoke ${String(Date.now())}`);
  });

  await test.step("create a design from a canvas preset", async () => {
    await page.getByRole("button", { name: "New design" }).click();
    await page.getByRole("button", { name: /Instagram post/ }).click();
    await expect(page.getByLabel("Document name")).toBeVisible();
    await expect(page.locator("header").getByText("Design", { exact: true })).toBeVisible();
    await expect(page.locator("main svg")).toBeVisible();
  });

  const firstSave = waitForDocumentSave(page);
  await test.step("draw a rectangle and a text element", async () => {
    await page.getByTitle("Rectangle (R)").click();
    await clickOnCanvas(page, 0.2, 0.2);
    await expect(page.getByLabel("Name rect layer")).toBeVisible();

    await page.getByTitle("Text (T)").click();
    await clickOnCanvas(page, 0.55, 0.55);
    await page.getByLabel("Text content").fill(TEXT_CONTENT);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Name text layer")).toBeVisible();
    await expect(page.locator("main svg")).toContainText(TEXT_CONTENT);
  });

  await test.step("wait for the indicator to reach saved", async () => {
    await firstSave;
    await expect(saveIndicator(page)).toHaveText("Saved");
  });

  await test.step("reload and find the document intact", async () => {
    await page.reload();
    await expect(page.getByLabel("Document name")).toBeVisible();
    await expect(page.getByLabel("Name rect layer")).toBeVisible();
    await expect(page.getByLabel("Name text layer")).toBeVisible();
    await expect(page.locator("main svg")).toContainText(TEXT_CONTENT);
  });

  await test.step("promote the design", async () => {
    await page.getByRole("button", { name: "Promote to Template" }).click();
    await expect(page.getByRole("heading", { name: "Variables" })).toBeVisible();
    await expect(page.locator("header").getByText("Template", { exact: true })).toBeVisible();
    await expect(page.locator("main svg")).toContainText(TEXT_CONTENT);
  });

  await test.step("declare a Variable", async () => {
    const declared = waitForDocumentSave(page);
    await page.getByLabel("New Variable name").fill(VARIABLE);
    await page.getByRole("button", { name: "Add Variable" }).click();
    await expect(page.getByLabel("Variable name", { exact: true })).toHaveValue(VARIABLE);
    await declared;
  });

  await test.step("bind it", async () => {
    const boundSave = waitForDocumentSave(page);
    await page.locator("main svg").getByText(TEXT_CONTENT).click();
    await page.keyboard.press("Enter");
    await page.getByLabel("Text content").fill(`{{${VARIABLE}}}`);
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 use")).toBeVisible();
    await boundSave;
    await expect(saveIndicator(page)).toHaveText("Saved");
  });

  await test.step("generate a PNG and receive the file as a download", async () => {
    await page.getByRole("button", { name: "Generate" }).click();
    const dialog = page.getByRole("dialog", { name: "Generate" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(VARIABLE).fill(GENERATED);
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Generate" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Untitled.png");
    const path = await download.path();
    if (path === null) throw new Error("the browser received no file");
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });
});

function saveIndicator(page: Page) {
  return page
    .getByRole("banner")
    .filter({ has: page.getByLabel("Document name") })
    .getByRole("status");
}

function waitForDocumentSave(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes("/api/v1/documents/") &&
      response.ok(),
  );
}

async function clickOnCanvas(page: Page, xRatio: number, yRatio: number) {
  const svg = page.locator("main svg");
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  if (box === null) throw new Error("the canvas SVG has no box");
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
}

function uniqueEmail() {
  return `editor-smoke-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
  await page.getByLabel("Sign-in code").fill(await readCode(email));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function createWorkspace(page: Page, name: string) {
  await expect(page).toHaveURL(/\/workspaces\/new$/);
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

async function readCode(email: string): Promise<string> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const code = codeFor(email, logSources());
    if (code !== undefined) return code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `the console Mailer did not log a code for ${email}. The smoke reads .dev/mailer.log and docker compose logs api; set SMOKE_API_LOG if neither holds it.`,
  );
}

function codeFor(email: string, logs: string): string | undefined {
  const fragment = `sign-in code for ${email}:`;
  for (const line of logs.split("\n").reverse()) {
    if (!line.includes(fragment)) continue;
    return line.match(/(\d{6})$/)?.[1];
  }
  return undefined;
}

function logSources(): string {
  const chunks: string[] = [];
  const named = process.env.SMOKE_API_LOG;
  if (named !== undefined && named !== "" && existsSync(named)) {
    chunks.push(readFileSync(named, "utf8"));
  }
  const mailer = join(repoRoot(), ".dev", "mailer.log");
  if (existsSync(mailer)) chunks.push(readFileSync(mailer, "utf8"));
  try {
    chunks.push(
      execFileSync("docker", ["compose", "logs", "--no-color", "api"], {
        encoding: "utf8",
        cwd: repoRoot(),
      }),
    );
  } catch {
    // The Compose app profile is optional; `pnpm dev` writes `.dev/mailer.log`.
  }
  return chunks.join("\n");
}

function repoRoot(): string {
  return join(here, "..", "..");
}
