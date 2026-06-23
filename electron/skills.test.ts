import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillService } from "./skills";
import type { VaultSummary } from "../src/types";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-skill-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const vaultA: VaultSummary = { id: "a", name: "Knowledge", repositoryPath: "/vaults/knowledge" };
const vaultB: VaultSummary = { id: "b", name: "Work", repositoryPath: "/vaults/work", remoteUrl: "git@example.com:team/work.git" };
const vaultWithMeta: VaultSummary = {
  id: "c",
  name: "Annotated",
  repositoryPath: "/vaults/annotated",
  defaultLanguage: "nl",
  structure: {
    "10-knowledge": {
      title: "Knowledge base",
      description: "Reference material.",
      children: { playbooks: { title: "Playbooks" } },
    },
  },
};

const claudeSkill = (home: string) => path.join(home, ".claude", "skills", "vault-guide", "SKILL.md");
const codexSkill = (home: string) => path.join(home, ".codex", "skills", "vault-guide", "SKILL.md");
const reviewerDir = (home: string, base: string) => path.join(home, base, "skills", "document-reviewer");

describe("SkillService", () => {
  it("renders the vault format guide and each registered vault", () => {
    const skill = new SkillService(temporaryDirectory()).render([vaultA, vaultB]);
    expect(skill).toContain("name: vault-guide");
    expect(skill).toContain("across the user's local Data Vault knowledge repositories");
    expect(skill).toContain("## Vault format");
    expect(skill).toContain("Knowledge");
    expect(skill).toContain("/vaults/knowledge");
    expect(skill).toContain("git@example.com:team/work.git");
  });

  it("renders the default language and directory outline", () => {
    const skill = new SkillService(temporaryDirectory()).render([vaultWithMeta]);
    expect(skill).toContain("Default language: `nl`");
    expect(skill).toContain("Directory structure:");
    expect(skill).toContain("**Knowledge base** (`10-knowledge`) — Reference material.");
    expect(skill).toContain("**Playbooks** (`playbooks`)");
  });

  it("fingerprints stably and changes when the vault list changes", () => {
    const service = new SkillService(temporaryDirectory());
    expect(service.fingerprint([vaultA])).toBe(service.fingerprint([vaultA]));
    expect(service.fingerprint([vaultA])).not.toBe(service.fingerprint([vaultA, vaultB]));
  });

  it("fingerprints change when the default language or structure changes", () => {
    const service = new SkillService(temporaryDirectory());
    const base: VaultSummary = { id: "a", name: "Knowledge", repositoryPath: "/vaults/knowledge" };
    expect(service.fingerprint([base])).not.toBe(service.fingerprint([{ ...base, defaultLanguage: "nl" }]));
    expect(service.fingerprint([base])).not.toBe(service.fingerprint([vaultWithMeta]));
  });

  it("installs the skill into the Claude and Codex skill directories", () => {
    const home = temporaryDirectory();
    const status = new SkillService(home).install([vaultA]);

    expect(status.state).toBe("current");
    for (const dir of [path.dirname(claudeSkill(home)), path.dirname(codexSkill(home))]) {
      expect(fs.existsSync(path.join(dir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, ".vault-guide.json"))).toBe(true);
    }
  });

  it("tells the writer to link documents and invoke the reviewer", () => {
    const skill = new SkillService(temporaryDirectory()).render([vaultA]);
    expect(skill).toContain("## Linking documents");
    expect(skill).toContain("## After making changes");
    expect(skill).toContain("document-reviewer");
    expect(skill).toContain("less public");
  });

  it("renders the document reviewer structural checks and each registered vault", () => {
    const home = temporaryDirectory();
    new SkillService(home).install([vaultA, vaultWithMeta]);
    const skill = fs.readFileSync(path.join(reviewerDir(home, ".claude"), "SKILL.md"), "utf8");
    expect(skill).toContain("name: document-reviewer");
    expect(skill).toContain("documents in the user's local Data Vault knowledge repositories");
    expect(skill).toContain("# Document Reviewer");
    expect(skill).toContain("## Structural checks");
    expect(skill).toContain("Link integrity");
    expect(skill).toContain("Cross-vault privacy");
    expect(skill).toContain("**Error**");
    expect(skill).toContain("**Knowledge base** (`10-knowledge`) — Reference material.");
  });

  it("installs the document reviewer skill into both directories", () => {
    const home = temporaryDirectory();
    new SkillService(home).install([vaultA]);
    for (const base of [".claude", ".codex"]) {
      const dir = reviewerDir(home, base);
      expect(fs.existsSync(path.join(dir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, ".document-reviewer.json"))).toBe(true);
    }
  });

  it("reports not-installed, then current, then outdated when vaults change", () => {
    const home = temporaryDirectory();
    const service = new SkillService(home);

    expect(service.status([vaultA]).state).toBe("not-installed");
    service.install([vaultA]);
    expect(service.status([vaultA]).state).toBe("current");
    expect(service.status([vaultA, vaultB]).state).toBe("outdated");
  });

  it("reports outdated when only the document reviewer skill is missing", () => {
    const home = temporaryDirectory();
    const service = new SkillService(home);
    service.install([vaultA]);
    fs.rmSync(reviewerDir(home, ".claude"), { recursive: true, force: true });
    expect(service.status([vaultA]).state).toBe("not-installed");
  });

  it("reports outdated when an installed skill no longer matches its generated content", () => {
    const home = temporaryDirectory();
    const service = new SkillService(home);
    service.install([vaultA]);
    fs.appendFileSync(claudeSkill(home), "\nLocally modified.\n");
    expect(service.status([vaultA]).state).toBe("outdated");
  });
});
