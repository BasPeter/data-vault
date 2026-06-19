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
});
