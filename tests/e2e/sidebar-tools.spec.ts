import { captureScreenshot, expect, test } from "./electron-app";

test("shows agent skills and update controls at the bottom of the sidebar", async ({ appLaunch }, testInfo) => {
  const { page } = appLaunch;

  const footer = page.locator('[data-sidebar="footer"]');

  // The agent-skill installer now lives in the sidebar footer with an
  // explanatory blurb naming the skills it installs. The exact headline and
  // button label depend on whether the skills are already installed.
  await expect(footer.getByText(/agent skills/i)).toBeVisible();
  await expect(footer.getByText(/vault-guide/)).toBeVisible();
  await expect(
    footer.getByRole("button", { name: /Install skills|Update skills|Re-install skills/ }),
  ).toBeVisible();

  // The update control moved here too and shows the installed version.
  await expect(footer.getByRole("button", { name: /^Data Vault/ })).toBeVisible();

  await captureScreenshot(page, testInfo, "sidebar-tools");
});

test("no longer renders the skills or update controls in the top toolbar", async ({ appLaunch }) => {
  const { page } = appLaunch;

  const header = page.locator("header");
  // The guided-tour entry point replaces them in the toolbar.
  await expect(header.getByRole("button", { name: "Start guided tour" })).toBeVisible();
  // The old icon-only skills popover trigger is gone from the toolbar.
  await expect(header.getByRole("button", { name: /Set up Claude and Codex skills/ })).toHaveCount(0);
});
