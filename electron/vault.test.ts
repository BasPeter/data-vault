import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VaultService } from "./vault";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("VaultService", () => {
  it("opens a compatible vault and builds its manifest", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "10-knowledge"), { recursive: true });
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Example" }));
    fs.writeFileSync(
      path.join(documents, "10-knowledge", "example.html"),
      "<!--vault\ntitle: Example document\ntags: one, two\n--><h1>Ignored fallback</h1>",
    );

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const manifest = service.manifest(vault.id);

    expect(vault.name).toBe("Example");
    expect(manifest.tree[0]).toMatchObject({ type: "folder", id: "10-knowledge" });
    expect(service.document(vault.id, "10-knowledge/example.html")).toMatchObject({
      title: "Example document",
      meta: { tags: ["one", "two"] },
    });
  });

  it("rejects traversal and symlinks outside the documents root", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    fs.writeFileSync(path.join(root, "outside.html"), "<h1>Outside</h1>");
    fs.symlinkSync(path.join(root, "outside.html"), path.join(documents, "link.html"));

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(() => service.document(vault.id, "../outside.html")).toThrow("Document not found");
    expect(() => service.document(vault.id, "link.html")).toThrow("Document not found");
    expect(service.manifest(vault.id).tree).toEqual([]);
  });

  it("stores quick notes outside the manifest and graph", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    fs.writeFileSync(path.join(documents, "document.html"), "<h1>Document</h1>");
    fs.writeFileSync(path.join(documents, "quick-notes.html"), "<!--vault\ntitle: Notes\n-->\n<p>Existing</p>");

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(service.quickNotes(vault.id)).toBe("<p>Existing</p>");
    expect(service.manifest(vault.id).tree).toHaveLength(1);
    expect(service.graph(vault.id).nodes).toHaveLength(1);

    service.saveQuickNotes(vault.id, "<h2>Updated</h2>");

    expect(service.quickNotes(vault.id)).toBe("<h2>Updated</h2>");
    expect(fs.readFileSync(path.join(documents, "quick-notes.html"), "utf8"))
      .toBe("<!--vault\ntitle: Quick notes\n-->\n<h2>Updated</h2>");
  });

  it("rejects oversized quick notes and symlink destinations", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    const outside = path.join(root, "outside.html");
    fs.writeFileSync(outside, "outside");
    fs.symlinkSync(outside, path.join(documents, "quick-notes.html"));

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(() => service.quickNotes(vault.id)).toThrow("Quick notes file is invalid");
    expect(() => service.saveQuickNotes(vault.id, "changed")).toThrow("Quick notes file is invalid");
    expect(() => service.saveQuickNotes(vault.id, "x".repeat(2 * 1024 * 1024 + 1)))
      .toThrow("Quick notes are too large");
    expect(fs.readFileSync(outside, "utf8")).toBe("outside");
  });
});
