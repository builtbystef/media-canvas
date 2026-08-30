import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEXT_CONTENT = "Hello";
const VARIABLE = "headline";
const CSV = `${VARIABLE},_name\nOne,one\nTwo,two\n`;
const here = dirname(fileURLToPath(import.meta.url));

test.use({ viewport: { width: 1400, height: 900 } });
test.describe.configure({ timeout: 120_000 });

test("the batch UI end-to-end smoke", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium-based browsers only");

  await test.step("sign in and create a workspace", async () => {
    await signIn(page, uniqueEmail());
    await createWorkspace(page, `Batch smoke ${String(Date.now())}`);
  });

  await test.step("open a template", async () => {
    await page.getByRole("button", { name: "New design" }).click();
    await page.getByRole("button", { name: /Instagram post/ }).click();
    await expect(page.getByLabel("Document name")).toBeVisible();

    const drawn = waitForDocumentSave(page);
    await page.getByTitle("Text (T)").click();
    await clickOnCanvas(page, 0.55, 0.55);
    await page.getByLabel("Text content").fill(TEXT_CONTENT);
    await page.keyboard.press("Escape");
    await expect(page.locator("main svg")).toContainText(TEXT_CONTENT);
    await drawn;
    await expect(saveIndicator(page)).toHaveText("Saved");

    await page.getByRole("button", { name: "Promote to Template" }).click();
    await expect(page.getByRole("heading", { name: "Variables" })).toBeVisible();
    await expect(page.locator("header").getByText("Template", { exact: true })).toBeVisible();

    const declared = waitForDocumentSave(page);
    await page.getByLabel("New Variable name").fill(VARIABLE);
    await page.getByRole("button", { name: "Add Variable" }).click();
    await expect(page.getByLabel("Variable name", { exact: true })).toHaveValue(VARIABLE);
    await declared;

    const bound = waitForDocumentSave(page);
    await page.locator("main svg").getByText(TEXT_CONTENT).click();
    await page.keyboard.press("Enter");
    await page.getByLabel("Text content").fill(`{{${VARIABLE}}}`);
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 use")).toBeVisible();
    await bound;
    await expect(saveIndicator(page)).toHaveText("Saved");
  });

  const dialog = page.getByRole("dialog", { name: "Generate" });
  await test.step("open the generate dialog's batch tab", async () => {
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "Batch" }).click();
    await expect(dialog.getByLabel("CSV file")).toBeVisible();
  });

  await test.step("upload a two-row CSV and see the mapping summary", async () => {
    await dialog.getByLabel("CSV file").setInputFiles({
      name: "batch.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV),
    });
    const mapping = dialog.getByRole("region", { name: "Column mapping" });
    await expect(mapping).toBeVisible();
    await expect(mapping).toContainText("Matched.");
    await expect(mapping).toContainText(VARIABLE);
    await expect(mapping).toContainText("Missing, required.");
    await expect(mapping).toContainText("none");
    await expect(mapping).toContainText("Row-name column.");
    await expect(mapping).toContainText("recognized");
    await expect(dialog.getByLabel("CSV preview")).toContainText("One");
    await expect(dialog.getByLabel("CSV preview")).toContainText("Two");
  });

  await test.step("submit and land on the job's page", async () => {
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(page).toHaveURL(/\/jobs\/[^/]+$/, { timeout: 60_000 });
    await expect(dialog).toHaveCount(0);
  });

  await test.step("watch it reach completed", async () => {
    await expect(page.getByText("Completed · PNG ×1")).toBeVisible({ timeout: 60_000 });
    const progress = page.getByRole("region", { name: "Progress" });
    await expect(progress).toContainText("2 of 2 finished");
    await expect(progress).toContainText("succeeded 2");
  });

  await test.step("download one Row's output", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "one" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (path === null) throw new Error("the browser received no Row file");
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  await test.step("download the archive", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download all (.zip)" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (path === null) throw new Error("the browser received no archive");
    const names = zipEntryNames(readFileSync(path));
    expect(names).toHaveLength(2);
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
  return `batch-smoke-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.com`;
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
  } catch {}
  return chunks.join("\n");
}

function repoRoot(): string {
  return join(here, "..", "..");
}

function zipEntryNames(bytes: Buffer): string[] {
  const eocdSig = 0x06054b50;
  const headerSig = 0x02014b50;
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("the archive is not a zip");
  const entries = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < entries; i += 1) {
    if (bytes.readUInt32LE(offset) !== headerSig) {
      throw new Error("the archive's central directory is broken");
    }
    const nameLen = bytes.readUInt16LE(offset + 28);
    const extraLen = bytes.readUInt16LE(offset + 30);
    const commentLen = bytes.readUInt16LE(offset + 32);
    names.push(bytes.subarray(offset + 46, offset + 46 + nameLen).toString("utf8"));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}
