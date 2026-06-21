import { captureScreenshot, expect, test } from "./electron-app";

test("opens the guided tour and steps forward and back", async ({ appLaunch }, testInfo) => {
  const { page } = appLaunch;

  // The tour is closed until the question-mark button in the toolbar is used.
  await expect(page.getByRole("dialog", { name: "Guided tour" })).toBeHidden();
  await page.getByRole("button", { name: "Start guided tour" }).click();

  const dialog = page.getByRole("dialog", { name: "Guided tour" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Welcome to Data Vault" })).toBeVisible();
  await expect(dialog.getByText("Step 1 of 8")).toBeVisible();
  // Back is disabled on the first step.
  await expect(dialog.getByRole("button", { name: "Back" })).toBeDisabled();
  await captureScreenshot(page, testInfo, "guided-tour");

  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Step 2 of 8")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Back" })).toBeEnabled();

  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByText("Step 1 of 8")).toBeVisible();

  await dialog.getByRole("button", { name: "Close guided tour" }).click();
  await expect(dialog).toBeHidden();
});

test("walks through every step and finishes with Done", async ({ appLaunch }) => {
  const { page } = appLaunch;
  await page.getByRole("button", { name: "Start guided tour" }).click();

  const dialog = page.getByRole("dialog", { name: "Guided tour" });
  await expect(dialog).toBeVisible();

  // Advance until the final step, where Next becomes Done.
  for (let step = 1; step < 8; step += 1) {
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText(`Step ${step + 1} of 8`)).toBeVisible();
  }

  await expect(dialog.getByRole("button", { name: "Next" })).toBeHidden();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
