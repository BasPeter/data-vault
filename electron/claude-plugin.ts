import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ClaudePluginExportResult, VaultSummary } from "../src/types";
import { renderCanonicalSkills } from "./skills";

export const CLAUDE_PLUGIN_VERSION = "1.0.0";
export const CLAUDE_PLUGIN_FILE = "data-vault-claude-plugin.zip";
export const CLAUDE_PLUGIN_ENTRIES = [
  ".claude-plugin/plugin.json",
  "README.md",
  "skills/document-reviewer/SKILL.md",
  "skills/vault-guide/SKILL.md",
] as const;

type Entry = { name: string; content: Buffer };

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Entry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.content.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.content.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

export function inspectClaudePluginArchive(archive: Buffer): string[] {
  const endOffset = archive.length - 22;
  if (endOffset < 0 || archive.readUInt32LE(endOffset) !== 0x06054b50) throw new Error("Invalid plugin archive.");
  const count = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid plugin archive entry.");
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const mode = archive.readUInt32LE(offset + 38) >>> 16;
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (path.posix.isAbsolute(name) || name.split("/").includes("..") || (mode & 0o170000) !== 0o100000) {
      throw new Error("Unsafe plugin archive entry.");
    }
    names.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (JSON.stringify(names) !== JSON.stringify(CLAUDE_PLUGIN_ENTRIES))
    throw new Error("Unexpected plugin archive contents.");
  return names;
}

function pluginEntries(vaults: VaultSummary[]): { entries: Entry[]; fingerprint: string } {
  const skills = renderCanonicalSkills(vaults).sort((a, b) => a.name.localeCompare(b.name));
  const manifest = `${JSON.stringify(
    {
      name: "data-vault",
      version: CLAUDE_PLUGIN_VERSION,
      description: "Vault-aware guidance and structural document review for Data Vault.",
      author: { name: "BasPeter" },
      repository: "https://github.com/BasPeter/data-vault",
    },
    null,
    2,
  )}\n`;
  const fingerprint = createHash("sha256")
    .update(manifest)
    .update(skills.map((skill) => `${skill.name}\0${skill.content}`).join("\0"))
    .digest("hex");
  const readme = `# Data Vault for Claude\n\nThis plugin is a snapshot of the vaults registered when it was exported.\n\nSnapshot fingerprint: \`${fingerprint}\`\n\n## Install or update\n\nIn Claude Desktop, open Customize > Plugins and upload this ZIP as a custom plugin. To update after changing vault configuration, remove the previously uploaded Data Vault plugin, export a new snapshot, and upload it. Same-name replacement is not assumed.\n\nBoth skills work in Chat and Cowork. If the standalone Claude skills are also installed, Claude may show duplicate capabilities; remove or disable either copy manually if desired.\n\n## Uninstall\n\nRemove the Data Vault plugin in Claude Desktop. Data Vault never modifies Claude Desktop's private plugin storage.\n`;
  const content = new Map<string, string>([
    [CLAUDE_PLUGIN_ENTRIES[0], manifest],
    [CLAUDE_PLUGIN_ENTRIES[1], readme],
    ...skills.map((skill) => [`skills/${skill.name}/SKILL.md`, skill.content] as [string, string]),
  ]);
  return {
    entries: CLAUDE_PLUGIN_ENTRIES.map((name) => ({ name, content: Buffer.from(content.get(name)!, "utf8") })),
    fingerprint,
  };
}

export function normalizeClaudePluginPath(filePath: string): string {
  return filePath.toLowerCase().endsWith(".zip") ? filePath : `${filePath}.zip`;
}

export async function resolveClaudePluginDestination(
  selection: { canceled: boolean; filePath?: string },
  exists: (filePath: string) => boolean,
  confirmReplace: (filePath: string) => Promise<boolean>,
): Promise<string | null> {
  if (selection.canceled || !selection.filePath) return null;
  const destination = normalizeClaudePluginPath(selection.filePath);
  if (destination !== selection.filePath && exists(destination) && !(await confirmReplace(destination))) return null;
  return destination;
}

export function sanitizedClaudePluginError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Plugin replacement failed;")) return error;
  return new Error("Claude plugin export failed. Choose another destination and try again.");
}

export class ClaudePluginExporter {
  constructor(private readonly renameFile: (source: string, destination: string) => void = fs.renameSync) {}

  export(filePath: string, vaults: VaultSummary[], overwriteConfirmed = false): ClaudePluginExportResult {
    const destination = normalizeClaudePluginPath(filePath);
    if (fs.existsSync(destination) && !overwriteConfirmed) throw new Error("The selected plugin file already exists.");
    const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}-${randomUUID()}.tmp`);
    const backup = path.join(path.dirname(destination), `.${path.basename(destination)}-${randomUUID()}.backup`);
    try {
      const { entries, fingerprint } = pluginEntries(vaults);
      fs.writeFileSync(temporary, zip(entries), { mode: 0o600, flag: "wx" });
      inspectClaudePluginArchive(fs.readFileSync(temporary));
      const replacing = overwriteConfirmed && fs.existsSync(destination);
      if (replacing) this.renameFile(destination, backup);
      try {
        this.renameFile(temporary, destination);
      } catch (error) {
        if (replacing && fs.existsSync(backup)) {
          try {
            this.renameFile(backup, destination);
          } catch {
            throw new Error(`Plugin replacement failed; the previous export is preserved at ${backup}`, {
              cause: error,
            });
          }
        }
        throw error;
      }
      fs.rmSync(backup, { force: true });
      return { exported: true, filePath: destination, pluginVersion: CLAUDE_PLUGIN_VERSION, fingerprint };
    } finally {
      fs.rmSync(temporary, { force: true });
      if (fs.existsSync(destination)) fs.rmSync(backup, { force: true });
    }
  }
}
