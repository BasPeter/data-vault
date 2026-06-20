import { expect, test } from "./electron-app";

test("renders the document tree from the vault manifest", async ({ appLaunch }) => {
  const { page } = appLaunch;
  await expect(page.getByRole("button", { name: "10 Knowledge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "20 Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Welcome" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Meeting Notes" })).toBeVisible();
});

test("opens a document and shows its metadata", async ({ appLaunch }) => {
  const { page } = appLaunch;
  await page.getByRole("button", { name: "Overview", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  // The "knowledge" tag from the metadata block renders as a badge.
  await expect(page.getByText("knowledge", { exact: true })).toBeVisible();
});

test("follows an internal document link", async ({ appLaunch }) => {
  const { page } = appLaunch;
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

  await page.locator(".doc-content").getByRole("link", { name: "architecture" }).click();
  await expect(page.getByRole("heading", { name: "Architecture", level: 1 })).toBeVisible();
});

test("renders Mermaid diagrams inside a document", async ({ appLaunch }) => {
  const { page } = appLaunch;
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  // Mermaid replaces the <pre> source with an inline SVG once rendered.
  await expect(page.locator(".doc-content svg")).toBeVisible();
});

test("switches between vaults via the toolbar selector", async ({ appLaunch }) => {
  const { page } = appLaunch;
  // Only the seeded vault is registered, so the selector reflects its name.
  await expect(page.getByRole("combobox")).toContainText("Example Vault");
});
