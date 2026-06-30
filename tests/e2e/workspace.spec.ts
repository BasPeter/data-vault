import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { captureScreenshot, expect, test } from "./electron-app";

test("uses the workspace features in one session", async ({ appLaunch }, testInfo) => {
  test.slow();
  const { page, userDataDir, vaultDir } = appLaunch;

  await test.step("loads the document tree and application controls", async () => {
    await expect(page.getByRole("button", { name: "10 Knowledge" })).toBeVisible();
    await expect(page.getByRole("button", { name: "20 Notes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Welcome" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meeting Notes" })).toBeVisible();
    await expect(page.getByTestId("vault-switcher")).toContainText("Example Vault");

    const footer = page.locator('[data-sidebar="footer"]');
    await expect(footer.getByText("Agent skills are up to date")).toBeVisible();
    await footer.getByRole("button", { name: "Agent skills are up to date" }).click();
    await expect(page.getByText("Vault Guide")).toBeVisible();
    await expect(page.getByText("Document Reviewer")).toBeVisible();
    await expect(page.getByText("Installed: v9")).toBeVisible();
    await expect(page.getByText("Latest: v5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(footer.getByRole("button", { name: /^Data Vault/ })).toBeVisible();

    const header = page.locator("header");
    await expect(header.getByRole("button", { name: "Start guided tour" })).toBeVisible();
    await expect(header.getByRole("button", { name: /Set up Claude and Codex skills/ })).toHaveCount(0);
    await captureScreenshot(page, testInfo, "document-tree");
    await captureScreenshot(page, testInfo, "sidebar-tools");
  });

  await test.step("isolates generated agent skills", async () => {
    for (const base of [".claude", ".codex"]) {
      for (const skill of ["vault-guide", "document-reviewer"]) {
        const skillFile = path.join(userDataDir, base, "skills", skill, "SKILL.md");
        await expect.poll(() => existsSync(skillFile)).toBe(true);
      }
    }
  });

  await test.step("navigates documents, metadata, links, and Mermaid", async () => {
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Meeting Notes", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Meeting Notes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meeting Notes", level: 1 })).toBeVisible();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("knowledge", { exact: true })).toBeVisible();
    await expect(page.locator(".doc-content svg")).toBeVisible();
    await captureScreenshot(page, testInfo, "document-with-metadata");
    await captureScreenshot(page, testInfo, "mermaid-diagram");

    await page.locator(".doc-content").getByRole("link", { name: "architecture" }).click();
    await expect(page.getByRole("tab", { name: "Architecture" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Architecture", level: 1 })).toBeVisible();
    const closeButtons = page.getByRole("tablist", { name: "Open documents" }).getByRole("button", { name: /^Close / });
    while ((await closeButtons.count()) > 0) {
      await closeButtons.first().click();
    }
    await expect(page.getByRole("heading", { name: "Open a document" })).toBeVisible();
    await page.locator("main").getByRole("button", { name: "Architecture" }).click();
    await expect(page.getByRole("heading", { name: "Architecture", level: 1 })).toBeVisible();
  });

  await test.step("opens, closes, and navigates through the graph", async () => {
    const graphButton = page.getByRole("button", { name: "Graph", exact: true });
    await graphButton.click();
    await expect(page.locator("svg circle").first()).toBeVisible();
    await expect(page.locator("svg circle")).not.toHaveCount(0);
    await expect(page.getByText("No documents to display.")).toBeHidden();

    await graphButton.click();
    await expect(page.locator(".doc-content")).toBeVisible();

    await graphButton.click();
    await page.waitForTimeout(2500);
    await captureScreenshot(page, testInfo, "graph-view");
    await page.locator("svg g.cursor-pointer").first().click({ force: true });
    await expect(page.locator(".doc-content")).toBeVisible();
  });

  await test.step("edits, saves, and reopens quick notes", async () => {
    const openNotes = () => page.getByRole("button", { name: "Quick notes", exact: true }).click();
    await openNotes();
    await expect(page.getByRole("heading", { name: "Quick notes" })).toBeVisible();
    await expect(page.getByText("No quick notes yet.")).toBeVisible();
    await page.getByRole("button", { name: "Edit quick notes" }).click();
    await page
      .getByRole("textbox", { name: "Quick notes HTML" })
      .fill("<h2>Test note</h2><p>Captured by the e2e suite.</p>");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Test note" })).toBeVisible();
    await captureScreenshot(page, testInfo, "quick-notes-saved");
    await page.getByRole("button", { name: "Close quick notes" }).click();
    await openNotes();
    await expect(page.getByRole("heading", { name: "Test note" })).toBeVisible();
    await page.getByRole("button", { name: "Close quick notes" }).click();
  });

  await test.step("walks through the guided tour", async () => {
    await expect(page.getByRole("dialog", { name: "Guided tour" })).toBeHidden();
    await page.getByRole("button", { name: "Start guided tour" }).click();
    const dialog = page.getByRole("dialog", { name: "Guided tour" });
    await expect(dialog.getByRole("heading", { name: "Welcome to Data Vault" })).toBeVisible();
    await expect(dialog.getByText("Step 1 of 8")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Back" })).toBeDisabled();
    await captureScreenshot(page, testInfo, "guided-tour");

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText("Step 2 of 8")).toBeVisible();
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(dialog.getByText("Step 1 of 8")).toBeVisible();
    for (let step = 1; step < 8; step += 1) {
      await dialog.getByRole("button", { name: "Next" }).click();
      await expect(dialog.getByText(`Step ${step + 1} of 8`)).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Next" })).toBeHidden();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("toggles the theme", async () => {
    const html = page.locator("html");
    const toggle = page.getByRole("button", { name: "Thema wisselen" });
    await expect(html).toHaveClass(/dark/);
    await captureScreenshot(page, testInfo, "dark-theme");
    await toggle.click();
    await expect(html).not.toHaveClass(/dark/);
    await captureScreenshot(page, testInfo, "light-theme");
    await toggle.click();
    await expect(html).toHaveClass(/dark/);
  });

  await test.step("edits and persists vault settings", async () => {
    const openSettings = async () => {
      await page.getByTestId("vault-switcher").click();
      await page.getByRole("button", { name: "Vault settings" }).click();
      await expect(page.getByRole("heading", { name: "Vault settings" })).toBeVisible();
    };
    const openStructure = async () => {
      await page.getByRole("button", { name: "Set up desired structure" }).click();
      await expect(page.getByRole("heading", { name: "Desired structure" })).toBeVisible();
    };

    await openSettings();
    await expect(page.getByLabel("Default language")).toHaveValue("");
    await captureScreenshot(page, testInfo, "vault-settings-dialog");
    await openStructure();
    await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "20-notes title" })).toBeVisible();
    await captureScreenshot(page, testInfo, "vault-structure-panel");

    await page.getByRole("textbox", { name: "10-knowledge title" }).fill("Knowledge Hub");
    await page.getByRole("textbox", { name: "10-knowledge description" }).fill("Curated reference docs.");
    await page.getByRole("button", { name: "Add directory" }).click();
    await page.getByRole("textbox", { name: "New directory name" }).fill("30-archive");
    await page.getByRole("textbox", { name: "30-archive title" }).fill("Archive");
    await captureScreenshot(page, testInfo, "vault-structure-filled");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByLabel("Default language").fill("nl");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Vault settings" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Knowledge Hub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "10 Knowledge" })).toHaveCount(0);
    await captureScreenshot(page, testInfo, "sidebar-updated");

    const config = JSON.parse(readFileSync(path.join(vaultDir, "vault.json"), "utf8"));
    expect(config.defaultLanguage).toBe("nl");
    expect(config.structure["10-knowledge"]).toMatchObject({
      title: "Knowledge Hub",
      description: "Curated reference docs.",
    });
    expect(config.structure["30-archive"]).toMatchObject({ title: "Archive" });

    await openSettings();
    await expect(page.getByLabel("Default language")).toHaveValue("nl");
    await openStructure();
    await expect(page.getByRole("textbox", { name: "10-knowledge title" })).toHaveValue("Knowledge Hub");
    await expect(page.getByRole("textbox", { name: "10-knowledge description" })).toHaveValue(
      "Curated reference docs.",
    );
    await expect(page.getByRole("textbox", { name: "30-archive title" })).toHaveValue("Archive");
    await captureScreenshot(page, testInfo, "vault-structure-reopened");
  });
});
