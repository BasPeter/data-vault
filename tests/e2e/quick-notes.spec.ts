import { captureScreenshot, expect, test } from "./electron-app";

test("edits, saves and persists quick notes", async ({ appLaunch }, testInfo) => {
  const { page } = appLaunch;

  const openNotes = () => page.getByRole("button", { name: "Quick notes", exact: true }).click();

  await openNotes();
  await expect(page.getByRole("heading", { name: "Quick notes" })).toBeVisible();
  await expect(page.getByText("No quick notes yet.")).toBeVisible();

  await page.getByRole("button", { name: "Edit quick notes" }).click();
  await page.getByRole("textbox", { name: "Quick notes HTML" })
    .fill("<h2>Test note</h2><p>Captured by the e2e suite.</p>");
  await page.getByRole("button", { name: "Save" }).click();

  // Saved notes render as sanitized HTML inside the panel.
  await expect(page.getByRole("heading", { name: "Test note" })).toBeVisible();
  await captureScreenshot(page, testInfo, "quick-notes-saved");

  // Close and reopen to confirm the note was written to the vault on disk.
  await page.getByRole("button", { name: "Close quick notes" }).click();
  await openNotes();
  await expect(page.getByRole("heading", { name: "Test note" })).toBeVisible();
});
