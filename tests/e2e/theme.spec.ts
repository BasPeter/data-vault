import { captureScreenshot, expect, test } from "./electron-app";

test("toggles between dark and light themes", async ({ appLaunch }, testInfo) => {
  const { page } = appLaunch;
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: "Thema wisselen" });

  // The application defaults to the dark theme.
  await expect(html).toHaveClass(/dark/);
  await captureScreenshot(page, testInfo, "dark-theme");

  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);
  await captureScreenshot(page, testInfo, "light-theme");

  await toggle.click();
  await expect(html).toHaveClass(/dark/);
});
