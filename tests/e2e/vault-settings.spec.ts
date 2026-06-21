import { readFileSync } from "node:fs";
import path from "node:path";
import { captureScreenshot, expect, test } from "./electron-app";

// Exercises the vault settings dialog: the default language field and the
// dedicated "desired structure" panel where existing folders are auto-scaffolded
// and new directories can be planned. Each step attaches a screenshot so CI runs
// produce a labelled gallery to inspect.
test("edits default language and folder metadata from vault settings", async ({ appLaunch }, testInfo) => {
  const { page, vaultDir } = appLaunch;

  const openSettings = async () => {
    await page.getByTestId("vault-switcher").click();
    await page.getByRole("button", { name: "Vault settings" }).click();
    await expect(page.getByRole("heading", { name: "Vault settings" })).toBeVisible();
  };

  const openStructure = async () => {
    await page.getByRole("button", { name: "Set up desired structure" }).click();
    await expect(page.getByRole("heading", { name: "Desired structure" })).toBeVisible();
  };

  // The seeded fixture has two folders (10-knowledge, 20-notes) and no saved
  // metadata yet, so the structure panel opens with empty title/description rows.
  await openSettings();
  await expect(page.getByLabel("Default language")).toHaveValue("");
  await captureScreenshot(page, testInfo, "vault-settings-dialog");

  await openStructure();
  await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "20-notes title" })).toBeVisible();
  await captureScreenshot(page, testInfo, "vault-structure-panel");

  // Annotate the first folder, then plan a brand-new directory that has no
  // counterpart on disk.
  await page.getByRole("textbox", { name: "10-knowledge title" }).fill("Knowledge Hub");
  await page.getByRole("textbox", { name: "10-knowledge description" }).fill("Curated reference docs.");
  await page.getByRole("button", { name: "Add directory" }).click();
  await page.getByRole("textbox", { name: "New directory name" }).fill("30-archive");
  await page.getByRole("textbox", { name: "30-archive title" }).fill("Archive");
  await captureScreenshot(page, testInfo, "vault-structure-filled");

  // Back to settings to set the language, then save the whole dialog at once.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Default language").fill("nl");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Vault settings" })).toBeHidden();

  // The sidebar re-fetches the manifest and shows the configured title in place
  // of the humanized folder name.
  await expect(page.getByRole("button", { name: "Knowledge Hub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "10 Knowledge" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "sidebar-updated");

  // The values are persisted to vault.json on disk, including the planned
  // directory that does not yet exist in the repository.
  const config = JSON.parse(readFileSync(path.join(vaultDir, "vault.json"), "utf8"));
  expect(config.defaultLanguage).toBe("nl");
  expect(config.structure["10-knowledge"]).toMatchObject({
    title: "Knowledge Hub",
    description: "Curated reference docs.",
  });
  expect(config.structure["30-archive"]).toMatchObject({ title: "Archive" });

  // Reopening the panel prefills the saved values.
  await openSettings();
  await expect(page.getByLabel("Default language")).toHaveValue("nl");
  await openStructure();
  await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toHaveValue("Knowledge Hub");
  await expect(page.getByRole("textbox", { name: "10-knowledge description" }))
    .toHaveValue("Curated reference docs.");
  await expect(page.getByRole("textbox", { name: "30-archive title" })).toHaveValue("Archive");
  await captureScreenshot(page, testInfo, "vault-structure-reopened");
});
