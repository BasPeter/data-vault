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

describe("SkillService", () => {
  it("renders the vault format guide and each registered vault", () => {
    const skill = new SkillService(temporaryDirectory()).render([vaultA, vaultB]);
    expect(skill).toContain("name: vault-guide");
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

  it("reports not-installed, then current, then outdated when vaults change", () => {
    const home = temporaryDirectory();
    const service = new SkillService(home);

    expect(service.status([vaultA]).state).toBe("not-installed");
    service.install([vaultA]);
    expect(service.status([vaultA]).state).toBe("current");
    expect(service.status([vaultA, vaultB]).state).toBe("outdated");
  });
});
