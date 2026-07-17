import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const fixtureRoot = path.resolve("tests/fixtures/dashboards");

describe("synthetic dashboard examples", () => {
  it("keeps personal progress in the fixed dashboard-local state API", () => {
    const source = fs.readFileSync(path.join(fixtureRoot, "valid-personal", "app.js"), "utf8");

    expect(source).toContain("dashboardApi.readState()");
    expect(source).toContain("dashboardApi.writeState({ completed: true })");
    expect(source).not.toMatch(/fetch\(|https?:\/\//);
  });

  it("reads approved vault intelligence, renders bodies as text, and reports uniform denial", () => {
    const source = fs.readFileSync(path.join(fixtureRoot, "valid-intelligence", "app.js"), "utf8");

    expect(source).toContain("dashboardApi.readVaultIndex()");
    expect(source).toContain("dashboardApi.readDocuments([approved.id])");
    expect(source).toContain('preview.textContent = result.documents[0]?.content ?? ""');
    expect(source).toContain('dashboardApi.readDocuments(["not-approved.html"])');
    expect(source).toContain("Unapproved document access was denied.");
    expect(source).not.toContain("innerHTML");
    expect(source).not.toMatch(/fetch\(|https?:\/\//);
  });
});
