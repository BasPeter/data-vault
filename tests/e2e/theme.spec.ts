import { expect, test } from "./electron-app";

test("toggles between dark and light themes", async ({ appLaunch }) => {
  const { page } = appLaunch;
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: "Thema wisselen" });

  // The application defaults to the dark theme.
  await expect(html).toHaveClass(/dark/);

  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);

  await toggle.click();
  await expect(html).toHaveClass(/dark/);
});
