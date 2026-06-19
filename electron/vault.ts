import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type {
  GraphData,
  GraphNode,
  LoadedDoc,
  Manifest,
  TreeNode,
  VaultSummary,
} from "../src/types";

const execFileAsync = promisify(execFile);
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const QUICK_NOTES_FILE = "quick-notes.html";
const QUICK_NOTES_HEADER = "<!--vault\ntitle: Quick notes\n-->\n";

type VaultConfig = {
  schemaVersion?: number;
  name?: string;
  documentsDirectory?: string;
};

type Registry = { vaults: VaultSummary[] };

function parseMeta(html: string): LoadedDoc["meta"] {
  const meta: LoadedDoc["meta"] = {};
  const block = html.match(/^\s*<!--vault\s*([\s\S]*?)-->/i)?.[1];
  if (!block) return meta;
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const [, rawKey, rawValue] = match;
    const key = rawKey.toLowerCase();
    if (key === "tags") {
      meta.tags = rawValue.split(",").map((tag) => tag.trim()).filter(Boolean);
    } else if (key === "title" || key === "date") {
      meta[key] = rawValue.trim();
    }
  }
  return meta;
}

function humanize(value: string): string {
  return value
    .replace(/\.html$/i, "")
    .split("-")
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function titleFor(html: string, fileName: string): string {
  const meta = parseMeta(html);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .trim();
  return meta.title || h1 || humanize(fileName);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function safeRepositoryUrl(url: string): boolean {
  if (!url || url.startsWith("-")) return false;
  if (/^git@[\w.-]+:[\w./-]+(?:\.git)?$/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "ssh:";
  } catch {
    return false;
  }
}

export class VaultService {
  private readonly registryFile: string;
  private readonly repositoriesDirectory: string;

  constructor(private readonly userDataDirectory: string) {
    this.registryFile = path.join(userDataDirectory, "vaults.json");
    this.repositoriesDirectory = path.join(userDataDirectory, "repositories");
    fs.mkdirSync(this.repositoriesDirectory, { recursive: true });
  }

  list(): VaultSummary[] {
    return this.registry().vaults.filter((vault) => fs.existsSync(vault.repositoryPath));
  }

  addLocal(repositoryPath: string): VaultSummary {
    const canonical = fs.realpathSync(repositoryPath);
    const existing = this.list().find((vault) => vault.repositoryPath === canonical);
    if (existing) return existing;
    const vault = this.describe(randomUUID(), canonical);
    this.save({ vaults: [...this.registry().vaults, vault] });
    return vault;
  }

  async clone(url: string): Promise<VaultSummary> {
    if (!safeRepositoryUrl(url)) throw new Error("Use an HTTPS, SSH, or git@ repository URL.");
    const id = randomUUID();
    const target = path.join(this.repositoriesDirectory, id);
    await execFileAsync("git", ["clone", "--depth=1", url, target], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    try {
      const vault = { ...this.describe(id, target), remoteUrl: url };
      this.save({ vaults: [...this.registry().vaults, vault] });
      return vault;
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      throw error;
    }
  }

  manifest(vaultId: string): Manifest {
    const root = this.documentsRoot(vaultId);
    return { tree: this.walk(root, root) };
  }

  document(vaultId: string, documentId: string): LoadedDoc {
    const root = this.documentsRoot(vaultId);
    if (!documentId || path.isAbsolute(documentId) || !documentId.toLowerCase().endsWith(".html")) {
      throw new Error("Invalid document ID.");
    }
    const candidate = path.resolve(root, documentId);
    if (!isWithin(root, candidate) || !fs.existsSync(candidate)) throw new Error("Document not found.");
    const canonical = fs.realpathSync(candidate);
    if (!isWithin(root, canonical) || !fs.statSync(canonical).isFile()) throw new Error("Document not found.");
    if (fs.statSync(canonical).size > MAX_DOCUMENT_BYTES) throw new Error("Document is too large.");
    const html = fs.readFileSync(canonical, "utf8");
    return {
      id: documentId.split(path.sep).join("/"),
      title: titleFor(html, path.basename(candidate)),
      meta: parseMeta(html),
      html: html.replace(/^\s*<!--vault[\s\S]*?-->/i, "").trim(),
    };
  }

  quickNotes(vaultId: string): string {
    const root = this.documentsRoot(vaultId);
    const file = path.join(root, QUICK_NOTES_FILE);
    if (!fs.existsSync(file)) return "";
    const canonical = fs.realpathSync(file);
    if (!isWithin(root, canonical) || !fs.statSync(canonical).isFile()) {
      throw new Error("Quick notes file is invalid.");
    }
    if (fs.statSync(canonical).size > MAX_DOCUMENT_BYTES + Buffer.byteLength(QUICK_NOTES_HEADER)) {
      throw new Error("Quick notes are too large.");
    }
    return fs.readFileSync(canonical, "utf8").replace(/^\s*<!--vault[\s\S]*?-->/i, "").trim();
  }

  saveQuickNotes(vaultId: string, html: string): void {
    if (Buffer.byteLength(html, "utf8") > MAX_DOCUMENT_BYTES) {
      throw new Error("Quick notes are too large.");
    }
    const root = this.documentsRoot(vaultId);
    const file = path.join(root, QUICK_NOTES_FILE);
    if (fs.existsSync(file)) {
      const stats = fs.lstatSync(file);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("Quick notes file is invalid.");
    }
    const temporary = path.join(root, `.quick-notes-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, QUICK_NOTES_HEADER + html, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  graph(vaultId: string): GraphData {
    const nodes = this.flatten(this.manifest(vaultId).tree);
    const ids = new Set(nodes.map((node) => node.id));
    const links: GraphData["links"] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const html = this.document(vaultId, node.id).html;
      for (const match of html.matchAll(/href=["']#([^"']+)["']/g)) {
        let target: string;
        try { target = decodeURIComponent(match[1]); } catch { continue; }
        if (!ids.has(target) || target === node.id) continue;
        const key = [node.id, target].sort().join("\0");
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ source: node.id, target });
      }
    }
    const degree = Object.fromEntries(nodes.map((node) => [node.id, 0]));
    for (const link of links) {
      degree[link.source] += 1;
      degree[link.target] += 1;
    }
    return { nodes: nodes.map((node) => ({ ...node, degree: degree[node.id] })), links };
  }

  async sync(vaultId: string): Promise<{ ahead: number; behind: number; pulled: boolean }> {
    const vault = this.vault(vaultId);
    const git = async (args: string[]) =>
      (await execFileAsync("git", ["-C", vault.repositoryPath, ...args], { timeout: 120_000 })).stdout.trim();
    const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    await git(["fetch", "--quiet"]);
    const [ahead = 0, behind = 0] = (await git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]))
      .split(/\s+/).map(Number);
    if (behind > 0) await git(["pull", "--ff-only", "--quiet"]);
    return { ahead, behind, pulled: behind > 0 };
  }

  private registry(): Registry {
    return readJson<Registry>(this.registryFile, { vaults: [] });
  }

  private save(registry: Registry): void {
    fs.mkdirSync(this.userDataDirectory, { recursive: true });
    const temporary = `${this.registryFile}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.registryFile);
  }

  private vault(id: string): VaultSummary {
    const vault = this.list().find((candidate) => candidate.id === id);
    if (!vault) throw new Error("Vault not found.");
    return vault;
  }

  private config(repositoryPath: string): VaultConfig {
    return readJson<VaultConfig>(path.join(repositoryPath, "vault.json"), {});
  }

  private describe(id: string, repositoryPath: string): VaultSummary {
    const config = this.config(repositoryPath);
    this.resolveDocumentsRoot(repositoryPath, config);
    return { id, name: config.name?.trim() || path.basename(repositoryPath), repositoryPath };
  }

  private documentsRoot(vaultId: string): string {
    const vault = this.vault(vaultId);
    return this.resolveDocumentsRoot(vault.repositoryPath, this.config(vault.repositoryPath));
  }

  private resolveDocumentsRoot(repositoryPath: string, config: VaultConfig): string {
    const repositoryRoot = fs.realpathSync(repositoryPath);
    const configured = config.documentsDirectory || "documents";
    if (path.isAbsolute(configured)) throw new Error("documentsDirectory must be relative.");
    const candidate = path.resolve(repositoryRoot, configured);
    if (!isWithin(repositoryRoot, candidate) || !fs.existsSync(candidate)) {
      throw new Error("Repository does not contain its configured documents directory.");
    }
    const canonical = fs.realpathSync(candidate);
    if (!isWithin(repositoryRoot, canonical) || !fs.statSync(canonical).isDirectory()) {
      throw new Error("Documents directory escapes the repository.");
    }
    return canonical;
  }

  private walk(root: string, directory: string): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.isSymbolicLink()) continue;
      if (directory === root && entry.name.toLowerCase() === QUICK_NOTES_FILE) continue;
      const absolute = path.join(directory, entry.name);
      const id = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        const children = this.walk(root, absolute);
        if (children.length) nodes.push({ type: "folder", id, label: humanize(entry.name), children });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        const html = fs.statSync(absolute).size <= MAX_DOCUMENT_BYTES ? fs.readFileSync(absolute, "utf8") : "";
        const meta = parseMeta(html);
        nodes.push({ type: "doc", id, label: titleFor(html, entry.name), date: meta.date ?? null, tags: meta.tags ?? [] });
      }
    }
    return [...nodes.filter((node) => node.type === "folder"), ...nodes.filter((node) => node.type === "doc")];
  }

  private flatten(nodes: TreeNode[], folder = "", output: GraphNode[] = []): GraphNode[] {
    for (const node of nodes) {
      if (node.type === "folder") this.flatten(node.children, folder || node.id, output);
      else output.push({ id: node.id, label: node.label, folder: folder || "(root)", tags: node.tags, degree: 0 });
    }
    return output;
  }
}
