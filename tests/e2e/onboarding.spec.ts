import { captureScreenshot, cleanup, launchApp, stubDirectoryDialog } from "./electron-app";
import { expect, test } from "@playwright/test";

test("opens a local repository from the onboarding screen", async ({}, testInfo) => {
  const launch = await launchApp({ seedVault: false });
  const { app, page, vaultDir } = launch;
  try {
    // With no registered vaults the app starts on the onboarding screen.
    await expect(page.getByRole("heading", { name: "Open a data vault" })).toBeVisible();
    await captureScreenshot(page, testInfo, "onboarding-screen");

    // Drive the "Open local repository" flow with a stubbed native picker.
    await stubDirectoryDialog(app, vaultDir);
    await page.getByRole("button", { name: "Open local repository" }).click();

    // The workspace shell replaces onboarding once the vault is registered.
    await expect(page.getByTestId("vault-switcher")).toContainText(/.+/);
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByRole("button", { name: "Welcome" })).toBeVisible();
    await captureScreenshot(page, testInfo, "vault-opened");
  } finally {
    await app.close();
    cleanup(launch);
  }
});

test("creates an empty vault from the onboarding screen", async ({}, testInfo) => {
  const launch = await launchApp({ seedVault: false });
  const { app, page } = launch;
  try {
    await expect(page.getByRole("heading", { name: "Open a data vault" })).toBeVisible();

    await page.getByPlaceholder("New vault name").fill("My New Vault");
    await page.getByRole("button", { name: "Create" }).click();

    // The new vault opens straight into its starter Welcome document.
    await expect(page.getByTestId("vault-switcher")).toContainText("My New Vault");
    await expect(page.getByRole("button", { name: "Welcome" })).toBeVisible();
    await captureScreenshot(page, testInfo, "empty-vault-created");
  } finally {
    await app.close();
    cleanup(launch);
  }
});
