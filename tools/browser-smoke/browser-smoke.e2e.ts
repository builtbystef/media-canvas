import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const apiLogs = () =>
  execFileSync("docker", ["compose", "logs", "--no-color", "api"], {
    encoding: "utf8",
  });

const occurrences = (text: string, fragment: string) => text.split(fragment).length - 1;

const uniqueEmail = () =>
  `browser-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();

  const line = apiLogs()
    .split("\n")
    .find((candidate) => candidate.includes(`sign-in code for ${email}:`));
  const code = line?.match(/(\d{6})$/)?.[1];
  if (code === undefined) throw new Error(`the console Mailer did not log a code for ${email}`);
  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function createWorkspace(page: Page, name: string) {
  await expect(page).toHaveURL(/\/workspaces\/new$/);
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

test("signed-out app pages are gated by sign-in", async ({ page }) => {
  for (const path of ["/", "/workspaces/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  }
});

test("a console Mailer code signs a new User in", async ({ page }) => {
  await signIn(page, uniqueEmail());

  await expect(page).toHaveURL(/\/workspaces\/new$/);
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
});

test("session-changing navigations and history restore recheck the server", async ({ page }) => {
  await signIn(page, uniqueEmail());
  await createWorkspace(page, `History ${Date.now()}`);

  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

  await page.getByRole("link", { name: "Templates" }).click();
  await expect(page).toHaveURL(/\?tab=templates$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const beforeBack = occurrences(apiLogs(), "GET /api/v1/me HTTP/1.1");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documents" })).toHaveCount(0);
  await expect
    .poll(() => occurrences(apiLogs(), "GET /api/v1/me HTTP/1.1"))
    .toBeGreaterThan(beforeBack);
});

test("the browser joins Workspace and document gestures", async ({ page }) => {
  await signIn(page, uniqueEmail());
  const suffix = Date.now();
  const first = `First ${suffix}`;
  const second = `Second ${suffix}`;
  await createWorkspace(page, first);

  await page.getByRole("link", { name: "New workspace" }).click();
  await createWorkspace(page, second);
  await page.getByLabel("Workspace").click();
  await page.getByRole("option", { name: second }).click();
  await expect(page.getByLabel("Workspace")).toContainText(second);
  await expect(page.getByText("Nothing here yet.")).toBeVisible();

  await page.getByRole("button", { name: "New design" }).click();
  await page.getByRole("button", { name: /Instagram post/ }).click();
  const name = page.getByLabel("Document name");
  await expect(name).toBeVisible();

  await name.fill("Blurred name");
  const blurSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" && response.url().includes("/api/v1/documents/"),
  );
  await name.blur();
  await blurSave;
  await page.reload();
  await expect(page.getByLabel("Document name")).toHaveValue("Blurred name");

  await page.getByLabel("Document name").fill("Final name");
  const enterSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" && response.url().includes("/api/v1/documents/"),
  );
  await page.getByLabel("Document name").press("Enter");
  await enterSave;
  await page.getByRole("link", { name: "Media Canvas" }).click();

  const design = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "Final name" }) })
    .filter({ hasText: "Design" });
  await design.getByRole("button", { name: "Promote" }).click();
  await expect(page.getByRole("link", { name: "Final name" })).toHaveCount(2);

  await design.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Delete “Final name”?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("link", { name: "Final name" })).toHaveCount(1);
  await expect(page.getByText("Template", { exact: true })).toBeVisible();
});
