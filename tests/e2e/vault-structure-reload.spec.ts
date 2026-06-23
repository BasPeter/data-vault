import { writeFileSync } from "node:fs";
import path from "node:path";
import { captureScreenshot, cleanup, launchApp } from "./electron-app";
import { expect, test } from "@playwright/test";

// Regression for the cached-registry bug: the registry only persisted id/name/
// path, so out-of-band edits to vault.json (by the user or an agent following the
// "Copy AI prompt" flow) never reached the settings panel. The service now
// re-reads vault.json on every list, so restarting the app surfaces the edits.
test("surfaces out-of-band vault.json structure edits after a restart", async ({}, testInfo) => {
  // This spec boots the Electron app twice (before and after the edit), so it
  // legitimately needs more than the default per-test budget.
  test.slow();

  const launch = await launchApp({ seedVault: true });
  const { app, page, vaultDir, userDataDir } = launch;

  const openStructure = async () => {
    await page.getByTestId("vault-switcher").click();
    await page.getByRole("button", { name: "Vault settings" }).click();
    await expect(page.getByRole("heading", { name: "Vault settings" })).toBeVisible();
    await page.getByRole("button", { name: "Set up desired structure" }).click();
    await expect(page.getByRole("heading", { name: "Desired structure" })).toBeVisible();
  };

  try {
    // The seeded registry holds no structure, mirroring a vault added before its
    // vault.json described one: the sidebar shows the humanized folder name and
    // the structure panel opens with blank title rows.
    await expect(page.getByRole("button", { name: "10 Knowledge" })).toBeVisible();
    await openStructure();
    await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toHaveValue("");
    await captureScreenshot(page, testInfo, "structure-before-edit");
  } finally {
    await app.close();
  }

  // Edit vault.json on disk while the app is closed — no app action writes this.
  writeFileSync(
    path.join(vaultDir, "vault.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: "Example Vault",
        documentsDirectory: "documents",
        structure: {
          "10-knowledge": { title: "Knowledge Hub", description: "Curated reference docs." },
          "30-archive": { title: "Archive" },
        },
      },
      null,
      2,
    )}\n`,
  );

  // Relaunch against the same registry and (now edited) vault; the startup list
  // re-reads vault.json from disk.
  const relaunch = await launchApp({ seedVault: false, reuse: { userDataDir, vaultDir } });
  try {
    // The configured title reaches the sidebar in place of the humanized name.
    await expect(relaunch.page.getByRole("button", { name: "Knowledge Hub" })).toBeVisible();
    await expect(relaunch.page.getByRole("button", { name: "10 Knowledge" })).toHaveCount(0);

    // …and the settings panel is now pre-filled, including the planned directory
    // that has no folder on disk yet.
    await relaunch.page.getByTestId("vault-switcher").click();
    await relaunch.page.getByRole("button", { name: "Vault settings" }).click();
    await relaunch.page.getByRole("button", { name: "Set up desired structure" }).click();
    await expect(relaunch.page.getByRole("heading", { name: "Desired structure" })).toBeVisible();
    await expect(relaunch.page.getByRole("textbox", { name: "10-knowledge title" })).toHaveValue("Knowledge Hub");
    await expect(relaunch.page.getByRole("textbox", { name: "10-knowledge description" })).toHaveValue(
      "Curated reference docs.",
    );
    await expect(relaunch.page.getByRole("textbox", { name: "30-archive title" })).toHaveValue("Archive");
    await captureScreenshot(relaunch.page, testInfo, "structure-after-restart");
  } finally {
    await relaunch.app.close();
    cleanup(launch);
  }
});
