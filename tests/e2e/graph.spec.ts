import { expect, test } from "./electron-app";

test("renders the document graph and navigates from a node", async ({ appLaunch }) => {
  const { page } = appLaunch;

  await page.getByRole("button", { name: "Graph", exact: true }).click();

  // One circle per document (plus an extra ring around the active node).
  await expect(page.locator("svg circle").first()).toBeVisible();
  await expect(page.locator("svg circle")).not.toHaveCount(0);
  await expect(page.getByText("No documents to display.")).toBeHidden();

  // Let the force simulation settle so node hit-targets stop moving.
  await page.waitForTimeout(2500);
  await page.locator("svg g.cursor-pointer").first().click({ force: true });

  // Selecting a node returns to the document view.
  await expect(page.locator(".doc-content")).toBeVisible();
});

test("toggles the graph view off again", async ({ appLaunch }) => {
  const { page } = appLaunch;
  const graphButton = page.getByRole("button", { name: "Graph", exact: true });

  await graphButton.click();
  await expect(page.locator("svg circle").first()).toBeVisible();

  await graphButton.click();
  await expect(page.locator(".doc-content")).toBeVisible();
});
