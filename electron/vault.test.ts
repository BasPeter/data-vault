import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cloneFailureMessage, syncFailureMessage, VaultService } from "./vault";

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
  it("turns Git credential prompt clone failures into actionable guidance", () => {
    const error = {
      stderr: [
        "Cloning into 'C:\\Users\\tab-revenboe\\AppData\\Roaming\\Data Vault\\repositories\\65d8ccda'...",
        "'C:\\Users\\tab-revenboe\\.local\\gh-cli\\bin\\gh.exe' auth git-credential get: line 1: C:\\Users\\tab-revenboe\\.local\\gh-cli\\bin\\gh.exe: No such file or directory",
        "bash: line 1: /dev/tty: No such device or address",
        "error: failed to execute prompt script (exit code 1)",
        "fatal: could not read Username for 'https://github.com': No such file or directory",
      ].join("\n"),
    };
    const message = cloneFailureMessage("https://github.com/ctechmssv/datavault", error);

    expect(message).toContain("Git needs credentials for github.com");
    expect(message).toContain("gh auth login");
    expect(message).toContain("gh auth setup-git");
    expect(message).toContain("git config --global --unset credential.helper");
    expect(message).toContain("private repositories");
    expect(message).not.toContain("Command failed: git clone");
  });

  it("turns Git credential prompt refresh failures into actionable guidance", () => {
    const message = syncFailureMessage("https://github.com/ctechmssv/datavault", {
      stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    });

    expect(message).toContain("Data Vault could not refresh this vault");
    expect(message).toContain("gh auth login");
    expect(message).toContain("Then try refreshing the vault again");
  });

  it("returns author and edit time for each document source line", async () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    const file = path.join(documents, "history.html");
    fs.writeFileSync(file, "<h1>History</h1>\n<p>First version</p>\n");
    execFileSync("git", ["-C", root, "init", "-b", "main"]);
    execFileSync("git", ["-C", root, "config", "user.name", "Vault Author"]);
    execFileSync("git", ["-C", root, "config", "user.email", "author@example.test"]);
    execFileSync("git", ["-C", root, "add", "documents/history.html"]);
    execFileSync("git", ["-C", root, "commit", "-m", "Add history document"], {
      env: { ...process.env, GIT_AUTHOR_DATE: "2024-01-02T12:00:00Z", GIT_COMMITTER_DATE: "2024-01-02T12:00:00Z" },
    });

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const lines = await service.blame(vault.id, "history.html");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      lineNumber: 1,
      content: "<h1>History</h1>",
      author: "Vault Author",
      timestamp: "2024-01-02T12:00:00.000Z",
      summary: "Add history document",
    });
    expect(lines[0].commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("marks source lines in an untracked document as uncommitted", async () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    fs.writeFileSync(path.join(documents, "draft.html"), "<h1>Draft</h1>\n<p>Work</p>");
    execFileSync("git", ["-C", root, "init", "-b", "main"]);

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    await expect(service.blame(vault.id, "draft.html")).resolves.toEqual([
      { lineNumber: 1, content: "<h1>Draft</h1>", author: "Not committed", timestamp: null, summary: "Untracked line", commit: null },
      { lineNumber: 2, content: "<p>Work</p>", author: "Not committed", timestamp: null, summary: "Untracked line", commit: null },
    ]);
  });

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
      sourceStartLine: 4,
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

  it("creates an empty vault with a committed starter document", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("My Notes");

    expect(vault.name).toBe("My Notes");
    expect(fs.existsSync(path.join(vault.repositoryPath, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(vault.repositoryPath, "documents"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).name)
      .toBe("My Notes");

    const manifest = service.manifest(vault.id);
    expect(manifest.tree).toHaveLength(1);
    expect(manifest.tree[0]).toMatchObject({ type: "doc", label: "Welcome" });

    const head = execFileSync("git", ["-C", vault.repositoryPath, "rev-parse", "HEAD"]).toString().trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("rejects an empty vault name", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    await expect(service.createEmpty("   ")).rejects.toThrow("Enter a vault name");
  });

  it("forgets registered vaults without deleting repository files", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");

    service.reset();

    expect(service.list()).toEqual([]);
    expect(fs.existsSync(path.join(vault.repositoryPath, "vault.json"))).toBe(true);
    expect(fs.existsSync(path.join(vault.repositoryPath, "documents", "welcome.html"))).toBe(true);
  });

  it("renames a vault without touching the remote", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Before");

    const result = await service.updateVault(vault.id, { name: "After" });

    expect(result.vault.name).toBe("After");
    expect(result.push).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).name)
      .toBe("After");
    expect(service.list().find((candidate) => candidate.id === vault.id)?.name).toBe("After");
  });

  it("configures a remote and reports a failed push", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");
    // Unreachable URL: the remote is configured and saved, but the push fails fast.
    const remoteUrl = "https://127.0.0.1:1/vault.git";

    const result = await service.updateVault(vault.id, { remoteUrl });

    expect(result.vault.remoteUrl).toBe(remoteUrl);
    expect(result.push?.ok).toBe(false);
    expect(service.list().find((candidate) => candidate.id === vault.id)?.remoteUrl).toBe(remoteUrl);

    const remote = execFileSync("git", ["-C", vault.repositoryPath, "remote", "get-url", "origin"])
      .toString().trim();
    expect(remote).toBe(remoteUrl);
  });

  it("rejects an unsafe remote URL", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");
    await expect(service.updateVault(vault.id, { remoteUrl: "not a url" }))
      .rejects.toThrow("HTTPS, SSH, or git@");
  });

  it("applies structure titles and descriptions to folder nodes", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "10-knowledge", "playbooks"), { recursive: true });
    fs.mkdirSync(path.join(documents, "20-plain"), { recursive: true });
    fs.writeFileSync(path.join(documents, "10-knowledge", "a.html"), "<h1>A</h1>");
    fs.writeFileSync(path.join(documents, "10-knowledge", "playbooks", "b.html"), "<h1>B</h1>");
    fs.writeFileSync(path.join(documents, "20-plain", "c.html"), "<h1>C</h1>");
    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({
        name: "Example",
        structure: {
          "10-knowledge": {
            title: "Knowledge base",
            description: "Reference material.",
            children: { playbooks: { title: "Playbooks" } },
          },
        },
      }),
    );

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const tree = service.manifest(vault.id).tree;

    const knowledge = tree.find((node) => node.id === "10-knowledge");
    expect(knowledge).toMatchObject({ type: "folder", label: "Knowledge base", description: "Reference material." });
    const playbooks = knowledge?.type === "folder" ? knowledge.children.find((c) => c.id === "10-knowledge/playbooks") : undefined;
    expect(playbooks).toMatchObject({ type: "folder", label: "Playbooks" });
    // Folders without metadata keep the humanized fallback label and no description.
    const plain = tree.find((node) => node.id === "20-plain");
    expect(plain).toMatchObject({ label: "20 Plain" });
    expect(plain?.type === "folder" ? plain.description : "set").toBeUndefined();
  });

  it("round-trips default language and structure through updateVault", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");

    const result = await service.updateVault(vault.id, {
      defaultLanguage: "nl",
      structure: { documents: { title: "Docs" } },
    });

    expect(result.vault.defaultLanguage).toBe("nl");
    expect(result.vault.structure).toMatchObject({ documents: { title: "Docs" } });

    const written = JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8"));
    expect(written.defaultLanguage).toBe("nl");
    expect(written.structure.documents.title).toBe("Docs");

    const stored = service.list().find((candidate) => candidate.id === vault.id);
    expect(stored?.defaultLanguage).toBe("nl");

    // Clearing the language removes it from vault.json.
    await service.updateVault(vault.id, { defaultLanguage: "" });
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).defaultLanguage)
      .toBeUndefined();
  });

  it("re-reads vault.json on every list so external edits surface", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "10-knowledge"), { recursive: true });
    fs.writeFileSync(path.join(documents, "10-knowledge", "a.html"), "<h1>A</h1>");
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Before" }));

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    expect(vault.name).toBe("Before");
    expect(vault.structure).toBeUndefined();

    // Edit vault.json out-of-band (as an agent or the user would) — no app action.
    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({
        name: "After",
        defaultLanguage: "nl",
        structure: { "10-knowledge": { title: "Knowledge base" } },
      }),
    );

    const listed = service.list().find((candidate) => candidate.id === vault.id);
    expect(listed?.name).toBe("After");
    expect(listed?.defaultLanguage).toBe("nl");
    expect(listed?.structure).toMatchObject({ "10-knowledge": { title: "Knowledge base" } });
    // The live structure also reaches the manifest labels.
    expect(service.manifest(vault.id).tree.find((node) => node.id === "10-knowledge"))
      .toMatchObject({ label: "Knowledge base" });
  });

  it("keeps the cached remote URL when re-describing from disk", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");
    // The remote lives in git config / the registry, not vault.json.
    const remoteUrl = "https://127.0.0.1:1/vault.git";
    await service.updateVault(vault.id, { remoteUrl });

    // A later out-of-band edit to vault.json must not drop the remote.
    fs.writeFileSync(
      path.join(vault.repositoryPath, "vault.json"),
      JSON.stringify({ name: "Renamed on disk" }),
    );

    const listed = service.list().find((candidate) => candidate.id === vault.id);
    expect(listed?.name).toBe("Renamed on disk");
    expect(listed?.remoteUrl).toBe(remoteUrl);
  });

  it("sanitizes hostile structure metadata and keeps the manifest working", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "safe"), { recursive: true });
    fs.writeFileSync(path.join(documents, "safe", "a.html"), "<h1>A</h1>");
    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({
        name: "Example",
        structure: {
          "../escape": { title: "Bad" },
          safe: { title: "Safe", description: "x".repeat(5000) },
        },
      }),
    );

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    // Path-traversal keys are dropped and over-long text is ignored.
    expect(vault.structure?.["../escape"]).toBeUndefined();
    expect(vault.structure?.safe).toMatchObject({ title: "Safe" });
    expect(vault.structure?.safe?.description).toBeUndefined();
    expect(service.manifest(vault.id).tree.find((node) => node.id === "safe")).toMatchObject({ label: "Safe" });
  });
});
