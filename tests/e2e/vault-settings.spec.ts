import { readFileSync } from "node:fs";
import path from "node:path";
import { captureScreenshot, expect, test } from "./electron-app";

// Exercises the vault settings dialog added for per-vault metadata: the default
// language field and the auto-scaffolded folder title/description form. Each step
// attaches a screenshot so CI runs produce a labelled gallery to inspect.
test("edits default language and folder metadata from vault settings", async ({ appLaunch }, testInfo) => {
  const { page, vaultDir } = appLaunch;

  const openSettings = async () => {
    await page.getByTestId("vault-switcher").click();
    await page.getByRole("button", { name: "Vault settings" }).click();
    await expect(page.getByRole("heading", { name: "Vault settings" })).toBeVisible();
  };

  // The seeded fixture has two folders (10-knowledge, 20-notes) and no saved
  // metadata yet, so the dialog opens with empty title/description rows.
  await openSettings();
  await expect(page.getByLabel("Default language")).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "20-notes title" })).toBeVisible();
  await captureScreenshot(page, testInfo, "vault-settings-dialog");

  // Fill the language and annotate the first folder.
  await page.getByLabel("Default language").fill("nl");
  await page.getByRole("textbox", { name: "10-knowledge title" }).fill("Knowledge Hub");
  await page.getByRole("textbox", { name: "10-knowledge description" }).fill("Curated reference docs.");
  await captureScreenshot(page, testInfo, "vault-settings-filled");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Vault settings" })).toBeHidden();

  // The sidebar re-fetches the manifest and shows the configured title in place
  // of the humanized folder name.
  await expect(page.getByRole("button", { name: "Knowledge Hub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "10 Knowledge" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "sidebar-updated");

  // The values are persisted to vault.json on disk.
  const config = JSON.parse(readFileSync(path.join(vaultDir, "vault.json"), "utf8"));
  expect(config.defaultLanguage).toBe("nl");
  expect(config.structure["10-knowledge"]).toMatchObject({
    title: "Knowledge Hub",
    description: "Curated reference docs.",
  });

  // Reopening the dialog prefills the saved values.
  await openSettings();
  await expect(page.getByLabel("Default language")).toHaveValue("nl");
  await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toHaveValue("Knowledge Hub");
  await expect(page.getByRole("textbox", { name: "10-knowledge description" }))
    .toHaveValue("Curated reference docs.");
  await captureScreenshot(page, testInfo, "vault-settings-reopened");
});
