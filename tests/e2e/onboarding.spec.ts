import { captureScreenshot, cleanup, launchApp, stubDirectoryDialog } from "./electron-app";
import { expect, test } from "@playwright/test";

test("opens a local repository and creates a second vault in one session", async ({}, testInfo) => {
  const launch = await launchApp({ seedVault: false });
  const { app, page, vaultDir } = launch;
  try {
    // With no registered vaults the app starts on the onboarding screen.
    await expect(page.getByRole("heading", { name: "Open a data vault" })).toBeVisible();
    await captureScreenshot(page, testInfo, "onboarding-screen");

    // The local-folder and Git-URL paths now live under the Advanced section.
    await page.getByRole("button", { name: "Advanced: open by Git URL or local folder" }).click();

    // Drive the "Open local repository" flow with a stubbed native picker.
    await stubDirectoryDialog(app, vaultDir);
    await page.getByRole("button", { name: "Open local repository" }).click();

    // The workspace shell replaces onboarding once the vault is registered.
    await expect(page.getByTestId("vault-switcher")).toContainText(/.+/);
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.locator('[data-sidebar="sidebar"]').getByRole("button", { name: "Welcome" })).toBeVisible();
    await captureScreenshot(page, testInfo, "vault-opened");

    // Continue the same user journey through the workspace vault switcher.
    await page.getByTestId("vault-switcher").click();
    await page.getByRole("button", { name: "Create empty vault…" }).click();
    const createDialog = page.getByRole("dialog", { name: "Create empty vault" });
    await createDialog.getByPlaceholder("My vault").fill("My New Vault");
    await createDialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByTestId("vault-switcher")).toContainText("My New Vault");
    await expect(page.locator('[data-sidebar="sidebar"]').getByRole("button", { name: "Welcome" })).toBeVisible();
    await captureScreenshot(page, testInfo, "empty-vault-created");
  } finally {
    await app.close();
    cleanup(launch);
  }
});
