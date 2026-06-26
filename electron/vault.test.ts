import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cloneFailureMessage, pushFailureMessage, syncFailureMessage, VaultService } from "./vault";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function trySymlink(target: string, link: string, type?: fs.symlink.Type): boolean {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (
      process.platform === "win32" &&
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EPERM"
    ) {
      return false;
    }
    throw error;
  }
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

  it("points authenticated credential failures at reconnecting instead of the gh CLI", () => {
    const error = { stderr: "fatal: Authentication failed for 'https://github.com/acme/vault.git/'" };

    const cloneMessage = cloneFailureMessage("https://github.com/acme/vault.git", error, true);
    expect(cloneMessage).toContain("your GitHub sign-in is no longer valid");
    expect(cloneMessage).toContain("Reconnect your GitHub account");
    expect(cloneMessage).not.toContain("gh auth login");

    const pushMessage = pushFailureMessage("https://github.com/acme/vault.git", error, true);
    expect(pushMessage).toContain("your GitHub sign-in is no longer valid");
    expect(pushMessage).not.toContain("gh auth login");

    const syncMessage = syncFailureMessage("https://github.com/acme/vault.git", error, true);
    expect(syncMessage).toContain("your GitHub sign-in is no longer valid");
  });

  it("falls back to a generic push message when there is no credential signal", () => {
    const message = pushFailureMessage("https://github.com/acme/vault.git", {
      stderr: "error: failed to push some refs to 'https://github.com/acme/vault.git'",
    });

    expect(message).toContain("pushing failed");
    expect(message).toContain("permission to push");
  });

  it("creates a missing documents directory when a vault is opened", () => {
    const root = temporaryDirectory();
    execFileSync("git", ["-C", root, "init", "-b", "main"]);
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Empty" }));
    expect(fs.existsSync(path.join(root, "documents"))).toBe(false);

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const manifest = service.manifest(vault.id);

    expect(manifest.tree).toEqual([]);
    expect(fs.statSync(path.join(root, "documents")).isDirectory()).toBe(true);
  });

  it("marks repositories without vault.json and creates config on metadata update", async () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "documents"));
    execFileSync("git", ["-C", root, "init", "-b", "main"]);

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(vault.hasConfig).toBe(false);
    expect(vault.name).toBe(path.basename(root));
    expect(fs.existsSync(path.join(root, "vault.json"))).toBe(false);

    const result = await service.updateVault(vault.id, {
      name: "Research Vault",
      defaultLanguage: "en",
      structure: { inbox: { title: "Inbox" } },
    });

    expect(result.vault.hasConfig).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(root, "vault.json"), "utf8"));
    expect(written).toMatchObject({
      schemaVersion: 1,
      name: "Research Vault",
      documentsDirectory: "documents",
      defaultLanguage: "en",
      structure: { inbox: { title: "Inbox" } },
    });
  });

  it("never creates a documents directory outside the repository", () => {
    const root = temporaryDirectory();
    execFileSync("git", ["-C", root, "init", "-b", "main"]);
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Bad", documentsDirectory: "../escape" }));

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));

    expect(() => service.addLocal(root)).toThrow("escapes the repository");
    expect(fs.existsSync(path.join(path.dirname(root), "escape"))).toBe(false);
  });

  it("preserves the remote URL and GitHub account across a live re-describe", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "documents"));
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Work" }));

    // remoteUrl and githubAccount live only in the registry (like git config),
    // not in vault.json, so list() must carry them onto the freshly described
    // summary rather than dropping them.
    const appData = path.join(temporaryDirectory(), "app-data");
    fs.mkdirSync(appData, { recursive: true });
    fs.writeFileSync(
      path.join(appData, "vaults.json"),
      JSON.stringify({
        vaults: [
          {
            id: "vault-1",
            name: "Work",
            repositoryPath: root,
            remoteUrl: "https://github.com/workco/vault.git",
            githubAccount: "workco",
          },
        ],
      }),
    );

    const [vault] = new VaultService(appData).list();
    expect(vault.remoteUrl).toBe("https://github.com/workco/vault.git");
    expect(vault.githubAccount).toBe("workco");
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
      {
        lineNumber: 1,
        content: "<h1>Draft</h1>",
        author: "Not committed",
        timestamp: null,
        summary: "Untracked line",
        commit: null,
      },
      {
        lineNumber: 2,
        content: "<p>Work</p>",
        author: "Not committed",
        timestamp: null,
        summary: "Untracked line",
        commit: null,
      },
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

  it("opens a markdown vault and builds its manifest", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "10-knowledge"), { recursive: true });
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Markdown", format: "markdown" }));
    fs.writeFileSync(path.join(documents, "10-knowledge", "ignored.html"), "<h1>Ignored</h1>");
    fs.writeFileSync(
      path.join(documents, "10-knowledge", "example.md"),
      "---\ntitle: Markdown document\ndate: 2026-06-26\ntags:\n  - one\n  - two\n---\n\n# Ignored fallback\n\nBody",
    );

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const manifest = service.manifest(vault.id);

    expect(vault.format).toBe("markdown");
    expect(manifest.tree[0]).toMatchObject({ type: "folder", id: "10-knowledge" });
    expect(manifest.tree[0].type === "folder" ? manifest.tree[0].children : []).toHaveLength(1);
    expect(service.document(vault.id, "10-knowledge/example.md")).toMatchObject({
      title: "Markdown document",
      format: "markdown",
      meta: { date: "2026-06-26", tags: ["one", "two"] },
      source: "# Ignored fallback\n\nBody",
    });
    expect(() => service.document(vault.id, "10-knowledge/ignored.html")).toThrow("Invalid document ID");
  });

  it("builds graph links from markdown relative links", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(path.join(documents, "10-knowledge"), { recursive: true });
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ name: "Markdown", format: "markdown" }));
    fs.writeFileSync(path.join(documents, "index.md"), "# Index\n\n[Overview](10-knowledge/overview.md#details)");
    fs.writeFileSync(path.join(documents, "10-knowledge", "overview.md"), "# Overview\n\n[Back](../index.md)");

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const graph = service.graph(vault.id);

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["10-knowledge/overview.md", "index.md"]);
    expect(graph.links).toEqual([{ source: "10-knowledge/overview.md", target: "index.md" }]);
  });

  it("rejects traversal and symlinks outside the documents root", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    fs.writeFileSync(path.join(root, "outside.html"), "<h1>Outside</h1>");
    const linkedFile = trySymlink(path.join(root, "outside.html"), path.join(documents, "link.html"), "file");
    if (!linkedFile) {
      const outsideDirectory = path.join(root, "outside-directory");
      fs.mkdirSync(outsideDirectory);
      fs.writeFileSync(path.join(outsideDirectory, "outside.html"), "<h1>Outside</h1>");
      expect(trySymlink(outsideDirectory, path.join(documents, "link"), "junction")).toBe(true);
    }

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(() => service.document(vault.id, "../outside.html")).toThrow("Document not found");
    expect(() => service.document(vault.id, linkedFile ? "link.html" : "link/outside.html")).toThrow(
      "Document not found",
    );
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
    expect(fs.readFileSync(path.join(documents, "quick-notes.html"), "utf8")).toBe(
      "<!--vault\ntitle: Quick notes\n-->\n<h2>Updated</h2>",
    );
  });

  it("changes the content signature when a document changes", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    fs.writeFileSync(path.join(documents, "document.html"), "<h1>Before</h1>");
    fs.writeFileSync(path.join(documents, "quick-notes.html"), "<p>Scratch</p>");

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);
    const before = service.contentSignature(vault.id);

    fs.writeFileSync(path.join(documents, "quick-notes.html"), "<p>Updated scratch</p>");
    expect(service.contentSignature(vault.id)).toBe(before);

    fs.writeFileSync(path.join(documents, "document.html"), "<h1>After</h1><p>New content</p>");
    expect(service.contentSignature(vault.id)).not.toBe(before);
  });

  it("rejects oversized quick notes and symlink destinations", () => {
    const root = temporaryDirectory();
    const documents = path.join(root, "documents");
    fs.mkdirSync(documents);
    const outside = path.join(root, "outside.html");
    fs.writeFileSync(outside, "outside");
    const quickNotes = path.join(documents, "quick-notes.html");
    const linkedFile = trySymlink(outside, quickNotes, "file");
    if (!linkedFile) fs.mkdirSync(quickNotes);

    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = service.addLocal(root);

    expect(() => service.quickNotes(vault.id)).toThrow("Quick notes file is invalid");
    expect(() => service.saveQuickNotes(vault.id, "changed")).toThrow("Quick notes file is invalid");
    expect(() => service.saveQuickNotes(vault.id, "x".repeat(2 * 1024 * 1024 + 1))).toThrow(
      "Quick notes are too large",
    );
    if (linkedFile) expect(fs.readFileSync(outside, "utf8")).toBe("outside");
  });

  it("creates an empty vault with a committed starter document", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("My Notes");

    expect(vault.name).toBe("My Notes");
    expect(fs.existsSync(path.join(vault.repositoryPath, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(vault.repositoryPath, "documents"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).name).toBe("My Notes");

    const manifest = service.manifest(vault.id);
    expect(manifest.tree).toHaveLength(1);
    expect(manifest.tree[0]).toMatchObject({ type: "doc", label: "Welcome" });

    const head = execFileSync("git", ["-C", vault.repositoryPath, "rev-parse", "HEAD"]).toString().trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  it("creates an empty markdown vault with a committed starter document", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Markdown Notes", "markdown");

    expect(vault.format).toBe("markdown");
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).format).toBe("markdown");
    expect(fs.existsSync(path.join(vault.repositoryPath, "documents", "welcome.md"))).toBe(true);
    expect(service.manifest(vault.id).tree[0]).toMatchObject({ type: "doc", id: "welcome.md", label: "Welcome" });
  });

  it("rejects an empty vault name", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    await expect(service.createEmpty("   ")).rejects.toThrow("Enter a vault name");
  });

  it("renames a vault without touching the remote", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Before");

    const result = await service.updateVault(vault.id, { name: "After" });

    expect(result.vault.name).toBe("After");
    expect(result.push).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).name).toBe("After");
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

    const remote = execFileSync("git", ["-C", vault.repositoryPath, "remote", "get-url", "origin"]).toString().trim();
    expect(remote).toBe(remoteUrl);
  });

  it("rejects an unsafe remote URL", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");
    await expect(service.updateVault(vault.id, { remoteUrl: "not a url" })).rejects.toThrow("HTTPS, SSH, or git@");
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
    const playbooks =
      knowledge?.type === "folder" ? knowledge.children.find((c) => c.id === "10-knowledge/playbooks") : undefined;
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
      format: "markdown",
      defaultLanguage: "nl",
      structure: { documents: { title: "Docs" } },
    });

    expect(result.vault.format).toBe("markdown");
    expect(result.vault.defaultLanguage).toBe("nl");
    expect(result.vault.structure).toMatchObject({ documents: { title: "Docs" } });

    const written = JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8"));
    expect(written.format).toBe("markdown");
    expect(written.defaultLanguage).toBe("nl");
    expect(written.structure.documents.title).toBe("Docs");

    const stored = service.list().find((candidate) => candidate.id === vault.id);
    expect(stored?.defaultLanguage).toBe("nl");

    // Clearing the language removes it from vault.json.
    await service.updateVault(vault.id, { defaultLanguage: "" });
    expect(
      JSON.parse(fs.readFileSync(path.join(vault.repositoryPath, "vault.json"), "utf8")).defaultLanguage,
    ).toBeUndefined();
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
    expect(service.manifest(vault.id).tree.find((node) => node.id === "10-knowledge")).toMatchObject({
      label: "Knowledge base",
    });
  });

  it("keeps the cached remote URL when re-describing from disk", async () => {
    const service = new VaultService(path.join(temporaryDirectory(), "app-data"));
    const vault = await service.createEmpty("Vault");
    // The remote lives in git config / the registry, not vault.json.
    const remoteUrl = "https://127.0.0.1:1/vault.git";
    await service.updateVault(vault.id, { remoteUrl });

    // A later out-of-band edit to vault.json must not drop the remote.
    fs.writeFileSync(path.join(vault.repositoryPath, "vault.json"), JSON.stringify({ name: "Renamed on disk" }));

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
