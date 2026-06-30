import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type {
  BlameLine,
  DirectoryMeta,
  GraphData,
  GraphNode,
  LoadedDoc,
  Manifest,
  TreeNode,
  VaultFormat,
  VaultStructure,
  VaultSummary,
  VaultUpdate,
  VaultUpdateResult,
} from "../src/types";

const execFileAsync = promisify(execFile);
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const QUICK_NOTES_FILE = "quick-notes.html";
const QUICK_NOTES_HEADER = "<!--vault\ntitle: Quick notes\n-->\n";
const DEFAULT_FORMAT: VaultFormat = "html";
const WELCOME_DOCUMENT =
  "<!--vault\ntitle: Welcome\n-->\n<h1>Welcome</h1>\n<p>This is your new vault. Add HTML documents under the documents directory to get started.</p>\n";
const WELCOME_MARKDOWN_DOCUMENT =
  "---\ntitle: Welcome\n---\n\n# Welcome\n\nThis is your new vault. Add Markdown documents under the documents directory to get started.\n";

type VaultConfig = {
  schemaVersion?: number;
  name?: string;
  documentsDirectory?: string;
  format?: VaultFormat;
  defaultLanguage?: string;
  structure?: VaultStructure;
};

// Bounds applied to the optional vault.json `structure` tree so that a malformed
// or hostile config can neither blow up memory nor smuggle path separators in
// directory keys. Kept in sync with the IPC validator in electron/main.ts.
const STRUCTURE_MAX_NODES = 500;
const STRUCTURE_MAX_DEPTH = 16;
const STRUCTURE_MAX_TEXT = 1000;

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
      meta.tags = rawValue
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (key === "title" || key === "date") {
      meta[key] = rawValue.trim();
    }
  }
  return meta;
}

function parseMarkdownMeta(markdown: string): { meta: LoadedDoc["meta"]; body: string; sourceStartLine: number } {
  const meta: LoadedDoc["meta"] = {};
  const normalized = markdown.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { meta, body: markdown, sourceStartLine: 1 };

  const block = match[1];
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scalar = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!scalar) continue;
    const key = scalar[1].toLowerCase();
    const value = scalar[2].replace(/^["']|["']$/g, "").trim();
    if (key === "title" && value) meta.title = value;
    else if (key === "date" && value) meta.date = value;
    else if (key === "tags") {
      const tags: string[] = [];
      if (value) {
        tags.push(
          ...value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        );
      } else {
        for (let next = index + 1; next < lines.length; next += 1) {
          const item = lines[next].match(/^\s*-\s*(.+?)\s*$/);
          if (!item) break;
          tags.push(item[1].replace(/^["']|["']$/g, "").trim());
          index = next;
        }
      }
      if (tags.length) meta.tags = tags;
    }
  }

  const body = normalized.slice(match[0].length);
  return { meta, body, sourceStartLine: match[0].split(/\r?\n/).length };
}

function humanize(value: string): string {
  return value
    .replace(/\.(?:html|md)$/i, "")
    .split("-")
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function markdownHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (match) return match[1].replace(/[*_`[\]]/g, "").trim();
  }
  return undefined;
}

function titleFor(html: string, fileName: string): string {
  const meta = parseMeta(html);
  const h1 = html
    .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .trim();
  return meta.title || h1 || humanize(fileName);
}

function markdownTitleFor(markdown: string, fileName: string): string {
  const parsed = parseMarkdownMeta(markdown);
  return parsed.meta.title || markdownHeading(parsed.body) || humanize(fileName);
}

function formatFromConfig(config: VaultConfig): VaultFormat {
  return config.format === "markdown" ? "markdown" : DEFAULT_FORMAT;
}

function extensionFor(format: VaultFormat): ".html" | ".md" {
  return format === "markdown" ? ".md" : ".html";
}

function normalizeMarkdownLink(sourceId: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || /^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) return null;
  const withoutQuery = trimmed.split("?")[0];
  const target = withoutQuery.startsWith("#") ? withoutQuery.slice(1) : withoutQuery.split("#")[0];
  if (!target || !target.toLowerCase().endsWith(".md")) return null;
  const base = path.posix.dirname(sourceId);
  const normalized = path.posix.normalize(target.startsWith("/") ? target.slice(1) : path.posix.join(base, target));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized;
}

function linksForDocument(doc: LoadedDoc, ids: Set<string>): string[] {
  const targets: string[] = [];
  if (doc.format === "markdown") {
    for (const match of doc.source.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (match[0].startsWith("!")) continue;
      const target = normalizeMarkdownLink(doc.id, match[1]);
      if (target && ids.has(target)) targets.push(target);
    }
    return targets;
  }

  for (const match of doc.html.matchAll(/href=["']#([^"']+)["']/g)) {
    try {
      targets.push(decodeURIComponent(match[1]));
    } catch {
      // Ignore malformed percent-encoding.
    }
  }
  return targets;
}

function parseBlame(output: string): BlameLine[] {
  const result: BlameLine[] = [];
  let commit = "";
  let lineNumber = 0;
  let author = "Unknown";
  let authorTime: number | null = null;
  let summary = "";

  for (const line of output.split("\n")) {
    const header = line.match(/^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/);
    if (header) {
      commit = header[1];
      lineNumber = Number(header[2]);
      author = "Unknown";
      authorTime = null;
      summary = "";
    } else if (line.startsWith("author ")) {
      author = line.slice(7);
    } else if (line.startsWith("author-time ")) {
      const parsed = Number(line.slice(12));
      authorTime = Number.isFinite(parsed) ? parsed : null;
    } else if (line.startsWith("summary ")) {
      summary = line.slice(8);
    } else if (line.startsWith("\t")) {
      const uncommitted = /^0+$/.test(commit);
      result.push({
        lineNumber,
        content: line.slice(1),
        author: uncommitted ? "Not committed" : author,
        timestamp: uncommitted || authorTime === null ? null : new Date(authorTime * 1000).toISOString(),
        summary: uncommitted ? "Uncommitted line" : summary,
        commit: uncommitted ? null : commit,
      });
    }
  }
  return result;
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

function nameFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  const last =
    withoutQuery
      .replace(/[/:]+$/, "")
      .split(/[/:]/)
      .pop() ?? "";
  return humanize(last.replace(/\.git$/i, "")).trim();
}

// The owner segment of a github.com HTTPS URL (e.g. "acme" from
// https://github.com/acme/vault.git), used to match a repository to a connected
// account when the vault has no explicit account recorded.
function ownerFromUrl(url: string): string | undefined {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[0];
  } catch {
    return undefined;
  }
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

function gitErrorOutput(error: unknown): string {
  const parts: string[] = [];
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.stderr === "string") parts.push(record.stderr);
    if (typeof record.stdout === "string") parts.push(record.stdout);
  }
  if (error instanceof Error) parts.push(error.message);
  else if (typeof error === "string") parts.push(error);
  return parts.join("\n").trim();
}

function gitCredentialFailureMessage(
  url: string | undefined,
  action: string,
  retryAction: string,
  error: unknown,
  authenticated = false,
): string | null {
  const output = gitErrorOutput(error);
  const credentialPromptFailed =
    /could not read Username|terminal prompts disabled|failed to execute prompt script|\/dev\/tty|git-credential|Authentication failed|invalid username or password|403|401/i.test(
      output,
    );
  const missingCredentialHelper =
    /gh(?:\.exe)?['"]?.*No such file or directory|No such file or directory.*gh(?:\.exe)?/i.test(output);

  if (!credentialPromptFailed && !missingCredentialHelper) return null;

  let host = "the Git server";
  if (url) {
    try {
      host = new URL(url).hostname || host;
    } catch {
      // Keep the generic host label when the URL cannot be parsed.
    }
  }
  const diagnostic = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" ");

  // When the app supplied a GitHub token, credential failures mean the token is
  // expired, revoked, or lacks access — point the user at reconnecting instead
  // of the gh CLI setup the manual-URL flow needs.
  if (authenticated) {
    return [
      `Data Vault could not ${action} because your GitHub sign-in is no longer valid.`,
      "Your token may have expired, been revoked, or lack access to this repository.",
      `Reconnect your GitHub account, then try ${retryAction} again. For organization repositories, also approve repository and SAML SSO access.`,
      diagnostic ? `Git said: ${diagnostic}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `Data Vault could not ${action} because Git needs credentials for ${host}, but no working credential prompt is available.`,
    "To fix this, open a terminal and sign in with GitHub CLI:",
    "gh auth login",
    "gh auth setup-git",
    "If Git is configured to use a missing gh.exe, reinstall GitHub CLI or remove the broken helper with:",
    "git config --global --unset credential.helper",
    `Then try ${retryAction} again. For private repositories, also confirm that your account has repository access. You can use an SSH URL instead after setting up an SSH key.`,
    diagnostic ? `Git said: ${diagnostic}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function cloneFailureMessage(url: string, error: unknown, authenticated = false): string {
  const credentialMessage = gitCredentialFailureMessage(
    url,
    "clone this repository",
    "cloning the vault",
    error,
    authenticated,
  );
  if (credentialMessage) return credentialMessage;

  const output = gitErrorOutput(error);
  const diagnostic = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");
  return [
    "Data Vault could not clone this repository.",
    "Check that the repository URL is correct, reachable from this computer, and accessible with your Git credentials.",
    diagnostic ? `Git said:\n${diagnostic}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function pushFailureMessage(url: string | undefined, error: unknown, authenticated = false): string {
  const credentialMessage = gitCredentialFailureMessage(
    url,
    "push to this repository",
    "saving the remote",
    error,
    authenticated,
  );
  if (credentialMessage) return credentialMessage;

  const output = gitErrorOutput(error);
  const diagnostic = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");
  return [
    "Data Vault saved the remote, but pushing failed.",
    "Check that the remote repository is reachable and that you have permission to push to it.",
    diagnostic ? `Git said:\n${diagnostic}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function syncFailureMessage(url: string | undefined, error: unknown, authenticated = false): string {
  const credentialMessage = gitCredentialFailureMessage(
    url,
    "refresh this vault",
    "refreshing the vault",
    error,
    authenticated,
  );
  if (credentialMessage) return credentialMessage;

  const output = gitErrorOutput(error);
  const diagnostic = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");
  return [
    "Data Vault could not refresh this vault.",
    "Check that the remote repository is reachable from this computer and accessible with your Git credentials.",
    diagnostic ? `Git said:\n${diagnostic}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isSafeSegment(key: string): boolean {
  return key.length > 0 && key !== "." && key !== ".." && !/[/\\]/.test(key);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > STRUCTURE_MAX_TEXT) return undefined;
  return trimmed;
}

// Coerce arbitrary input into a bounded VaultStructure, dropping anything that
// is malformed, escapes the directory namespace, or exceeds the size limits.
// Returns undefined when nothing usable remains.
function sanitizeStructure(value: unknown): VaultStructure | undefined {
  let remaining = STRUCTURE_MAX_NODES;

  function level(input: unknown, depth: number): VaultStructure | undefined {
    if (depth > STRUCTURE_MAX_DEPTH || typeof input !== "object" || input === null || Array.isArray(input)) {
      return undefined;
    }
    const output: VaultStructure = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      if (remaining <= 0 || !isSafeSegment(key)) continue;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
      remaining -= 1;
      const node = raw as Record<string, unknown>;
      const entry: DirectoryMeta = {};
      const title = cleanText(node.title);
      if (title) entry.title = title;
      const description = cleanText(node.description);
      if (description) entry.description = description;
      const children = level(node.children, depth + 1);
      if (children) entry.children = children;
      output[key] = entry;
    }
    return Object.keys(output).length ? output : undefined;
  }

  return level(value, 1);
}

export class VaultService {
  private readonly registryFile: string;
  private readonly repositoriesDirectory: string;

  constructor(
    private readonly userDataDirectory: string,
    // Returns the git extraheader value carrying the GitHub OAuth token for the
    // given account (or matched by repository owner), or null when no connected
    // account applies. Injected so the git/fs layer never imports the auth module
    // and the token only ever appears at invocation time.
    private readonly gitHubAuthHeader?: (account?: string, ownerHint?: string) => string | null,
  ) {
    this.registryFile = path.join(userDataDirectory, "vaults.json");
    this.repositoriesDirectory = path.join(userDataDirectory, "repositories");
    fs.mkdirSync(this.repositoriesDirectory, { recursive: true });
  }

  // Feed the GitHub token to git for github.com remotes without persisting it in
  // repo config or the remote URL. Passing the extraheader via GIT_CONFIG_* env
  // (rather than `-c` argv) also keeps the token out of the process list.
  private githubAuthEnv(url: string | undefined, account?: string): NodeJS.ProcessEnv {
    if (!url || !/^https:\/\/github\.com\//i.test(url)) return {};
    const header = this.gitHubAuthHeader?.(account, ownerFromUrl(url));
    if (!header) return {};
    return {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: header,
    };
  }

  private authenticatedFor(url: string | undefined, account?: string): boolean {
    return Object.keys(this.githubAuthEnv(url, account)).length > 0;
  }

  // Forget every opened vault, returning the app to its first-run state. Only the
  // registry that lists the vaults is cleared; the cloned repositories on disk are
  // left untouched (their UUID-named directories never collide with future clones,
  // and they may hold unpushed commits), as are any local folders the user added.
  reset(): void {
    fs.rmSync(this.registryFile, { force: true });
  }

  // Forget a single vault, dropping it from the registry so it no longer appears
  // in the app. Like reset(), the repository on disk — a clone under userData or a
  // local folder the user added — is left untouched; only the registry entry goes.
  remove(vaultId: string): void {
    this.save({ vaults: this.registry().vaults.filter((vault) => vault.id !== vaultId) });
  }

  list(): VaultSummary[] {
    // Re-describe from each repository's vault.json on every read so hand- or
    // agent-edits to name/defaultLanguage/structure surface without re-adding the
    // vault. The registry only persists the id and the remote URL (which lives in
    // git config, not vault.json); everything else is derived live. Fall back to
    // the cached entry when the repository is momentarily unreadable.
    return this.registry()
      .vaults.filter((vault) => fs.existsSync(vault.repositoryPath))
      .map((vault) => {
        try {
          const fresh = this.describe(vault.id, vault.repositoryPath);
          // remoteUrl and githubAccount are app-local (registry only), so carry
          // them forward onto the freshly described summary.
          if (vault.remoteUrl) fresh.remoteUrl = vault.remoteUrl;
          if (vault.githubAccount) fresh.githubAccount = vault.githubAccount;
          return fresh;
        } catch {
          return { ...vault, format: vault.format ?? DEFAULT_FORMAT };
        }
      });
  }

  addLocal(repositoryPath: string): VaultSummary {
    const canonical = fs.realpathSync(repositoryPath);
    const existing = this.list().find((vault) => vault.repositoryPath === canonical);
    if (existing) return existing;
    // Adding a repository is an explicit write action: create the documents
    // directory if it is missing so an empty clone can still be opened.
    this.resolveDocumentsRoot(canonical, this.config(canonical), true);
    const vault = this.describe(randomUUID(), canonical);
    this.save({ vaults: [...this.registry().vaults, vault] });
    return vault;
  }

  async clone(url: string): Promise<VaultSummary> {
    if (!safeRepositoryUrl(url)) throw new Error("Use an HTTPS, SSH, or git@ repository URL.");
    return this.cloneInternal(url, nameFromUrl(url));
  }

  // Clone a GitHub repository identified by `owner/repo` using the given connected
  // account. The remote URL stays the clean https://github.com/owner/repo.git
  // form; the OAuth token is supplied to git separately via githubAuthEnv.
  async cloneByFullName(fullName: string, account?: string): Promise<VaultSummary> {
    const url = `https://github.com/${fullName}.git`;
    if (!safeRepositoryUrl(url)) throw new Error("Invalid repository name.");
    return this.cloneInternal(url, nameFromUrl(url), account);
  }

  private async cloneInternal(url: string, displayName: string, account?: string): Promise<VaultSummary> {
    const id = randomUUID();
    const target = path.join(this.repositoriesDirectory, id);
    try {
      await execFileAsync("git", ["clone", "--depth=1", url, target], {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...this.githubAuthEnv(url, account) },
      });
      // Ensure the cloned repository has its documents directory so a freshly
      // created or otherwise empty vault opens without erroring.
      this.resolveDocumentsRoot(target, this.config(target), true);
      const vault: VaultSummary = { ...this.describe(id, target, displayName), remoteUrl: url };
      if (account) vault.githubAccount = account;
      this.save({ vaults: [...this.registry().vaults, vault] });
      return vault;
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      throw new Error(cloneFailureMessage(url, error, this.authenticatedFor(url, account)), { cause: error });
    }
  }

  async createEmpty(name: string, format: VaultFormat = DEFAULT_FORMAT): Promise<VaultSummary> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200) throw new Error("Enter a vault name.");
    if (format !== "html" && format !== "markdown") throw new Error("Invalid document format.");
    const id = randomUUID();
    const target = path.join(this.repositoriesDirectory, id);
    try {
      fs.mkdirSync(path.join(target, "documents"), { recursive: true });
      fs.writeFileSync(
        path.join(target, "vault.json"),
        `${JSON.stringify({ schemaVersion: 1, name: trimmed, documentsDirectory: "documents", format }, null, 2)}\n`,
      );
      fs.writeFileSync(
        path.join(target, "documents", format === "markdown" ? "welcome.md" : "welcome.html"),
        format === "markdown" ? WELCOME_MARKDOWN_DOCUMENT : WELCOME_DOCUMENT,
      );
      await this.git(target, ["init", "-b", "main"]);
      await this.git(target, ["add", "-A"]);
      await this.git(target, [
        "-c",
        "user.name=Data Vault",
        "-c",
        "user.email=data-vault@localhost",
        "commit",
        "-m",
        "Initialize vault",
      ]);
      const vault = this.describe(id, target);
      this.save({ vaults: [...this.registry().vaults, vault] });
      return vault;
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      throw error;
    }
  }

  async updateVault(vaultId: string, update: VaultUpdate): Promise<VaultUpdateResult> {
    const vault = this.vault(vaultId);
    let next: VaultSummary = { ...vault };
    const patch: Partial<VaultConfig> = {};

    if (update.name !== undefined) {
      const trimmed = update.name.trim();
      if (!trimmed || trimmed.length > 200) throw new Error("Enter a vault name.");
      patch.name = trimmed;
      next = { ...next, name: trimmed };
    }

    if (update.defaultLanguage !== undefined) {
      const language = update.defaultLanguage.trim();
      if (language.length > STRUCTURE_MAX_TEXT) throw new Error("Default language is too long.");
      patch.defaultLanguage = language || undefined;
      next = { ...next, defaultLanguage: language || undefined };
    }

    if (update.format !== undefined) {
      if (update.format !== "html" && update.format !== "markdown") throw new Error("Invalid document format.");
      patch.format = update.format;
      next = { ...next, format: update.format };
    }

    if (update.structure !== undefined) {
      const structure = sanitizeStructure(update.structure);
      patch.structure = structure;
      next = { ...next, structure };
    }

    if (Object.keys(patch).length) {
      this.writeConfig(vault.repositoryPath, patch);
      next = { ...next, hasConfig: true };
    }

    if (update.remoteUrl !== undefined) {
      const url = update.remoteUrl.trim();
      if (!safeRepositoryUrl(url)) throw new Error("Use an HTTPS, SSH, or git@ repository URL.");
      const remotes = await this.git(vault.repositoryPath, ["remote"]);
      const command = remotes.split(/\s+/).includes("origin") ? "set-url" : "add";
      await this.git(vault.repositoryPath, ["remote", command, "origin", url]);
      next = { ...next, remoteUrl: url };
    }

    this.save({
      vaults: this.registry().vaults.map((candidate) => (candidate.id === vaultId ? next : candidate)),
    });

    let push: VaultUpdateResult["push"];
    if (update.remoteUrl !== undefined && next.remoteUrl) {
      try {
        await this.git(vault.repositoryPath, ["push", "-u", "origin", "HEAD"], {
          GIT_TERMINAL_PROMPT: "0",
          ...this.githubAuthEnv(next.remoteUrl, next.githubAccount),
        });
        push = { ok: true };
      } catch (error) {
        push = {
          ok: false,
          message: pushFailureMessage(next.remoteUrl, error, this.authenticatedFor(next.remoteUrl, next.githubAccount)),
        };
      }
    }

    return { vault: next, push };
  }

  private writeConfig(repositoryPath: string, patch: Partial<VaultConfig>): void {
    const file = path.join(repositoryPath, "vault.json");
    const config: Record<string, unknown> = fs.existsSync(file)
      ? { ...this.config(repositoryPath) }
      : { schemaVersion: 1, documentsDirectory: "documents" };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete config[key];
      else config[key] = value;
    }
    const temporary = path.join(repositoryPath, `.vault-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8" });
      fs.renameSync(temporary, file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  private async git(repositoryPath: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    const result = await execFileAsync("git", ["-C", repositoryPath, ...args], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : process.env,
    });
    return result.stdout.trim();
  }

  manifest(vaultId: string): Manifest {
    const vault = this.vault(vaultId);
    const config = this.config(vault.repositoryPath);
    const format = formatFromConfig(config);
    // Opening a specific vault creates its documents directory if missing so an
    // empty or freshly created repository renders instead of erroring.
    const root = this.resolveDocumentsRoot(vault.repositoryPath, config, true);
    return { tree: this.walk(root, root, sanitizeStructure(config.structure), format) };
  }

  document(vaultId: string, documentId: string): LoadedDoc {
    const { candidate, canonical, format } = this.documentFile(vaultId, documentId);
    const source = fs.readFileSync(canonical, "utf8");
    if (format === "markdown") {
      const parsed = parseMarkdownMeta(source);
      const body = parsed.body.trim();
      return {
        id: documentId.split(path.sep).join("/"),
        title: markdownTitleFor(source, path.basename(candidate)),
        meta: parsed.meta,
        format,
        source: body,
        html: body,
        sourceStartLine: parsed.sourceStartLine,
      };
    }
    const metadata = source.match(/^\s*<!--vault[\s\S]*?-->/i)?.[0] ?? "";
    const content = source.slice(metadata.length);
    const leadingWhitespace = content.match(/^\s*/)?.[0] ?? "";
    const sourceStartLine = source.slice(0, metadata.length + leadingWhitespace.length).split(/\r?\n/).length;
    return {
      id: documentId.split(path.sep).join("/"),
      title: titleFor(source, path.basename(candidate)),
      meta: parseMeta(source),
      format,
      source: content.trim(),
      html: content.trim(),
      sourceStartLine,
    };
  }

  resolveDocumentPath(filePath: string): { vaultId: string; documentId: string } {
    if (!filePath || filePath.length > 4096) throw new Error("Invalid document path.");
    const canonical = fs.realpathSync(filePath);
    if (!fs.statSync(canonical).isFile()) throw new Error("Document not found.");

    for (const vault of this.list()) {
      const config = this.config(vault.repositoryPath);
      const format = formatFromConfig(config);
      const extension = extensionFor(format);
      const root = this.resolveDocumentsRoot(vault.repositoryPath, config);
      if (!isWithin(root, canonical)) continue;
      const documentId = path.relative(root, canonical).split(path.sep).join("/");
      if (
        !documentId ||
        documentId === "." ||
        documentId.startsWith("../") ||
        path.posix.isAbsolute(documentId) ||
        documentId.toLowerCase() === QUICK_NOTES_FILE ||
        !documentId.toLowerCase().endsWith(extension)
      ) {
        throw new Error("Invalid document path.");
      }
      this.document(vault.id, documentId);
      return { vaultId: vault.id, documentId };
    }

    throw new Error("Document path is not in a registered vault.");
  }

  async blame(vaultId: string, documentId: string): Promise<BlameLine[]> {
    const vault = this.vault(vaultId);
    const { canonical } = this.documentFile(vaultId, documentId);
    const relative = path.relative(vault.repositoryPath, canonical).split(path.sep).join("/");
    try {
      const output = await this.git(vault.repositoryPath, ["blame", "--line-porcelain", "--", relative]);
      return parseBlame(output);
    } catch (error) {
      // An untracked document has no Git history yet. Still show its source in
      // blame mode and identify every line as uncommitted.
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such path|no such file|no such ref|fatal:.*path|bad revision/i.test(message)) throw error;
      return fs
        .readFileSync(canonical, "utf8")
        .split(/\r?\n/)
        .map((content, index) => ({
          lineNumber: index + 1,
          content,
          author: "Not committed",
          timestamp: null,
          summary: "Untracked line",
          commit: null,
        }));
    }
  }

  private documentFile(
    vaultId: string,
    documentId: string,
  ): { candidate: string; canonical: string; format: VaultFormat } {
    const vault = this.vault(vaultId);
    const format = vault.format;
    const extension = extensionFor(format);
    const root = this.documentsRoot(vaultId);
    if (!documentId || path.isAbsolute(documentId) || !documentId.toLowerCase().endsWith(extension)) {
      throw new Error("Invalid document ID.");
    }
    const candidate = path.resolve(root, documentId);
    if (!isWithin(root, candidate) || !fs.existsSync(candidate)) throw new Error("Document not found.");
    const canonical = fs.realpathSync(candidate);
    if (!isWithin(root, canonical) || !fs.statSync(canonical).isFile()) throw new Error("Document not found.");
    if (fs.statSync(canonical).size > MAX_DOCUMENT_BYTES) throw new Error("Document is too large.");
    return { candidate, canonical, format };
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
    return fs
      .readFileSync(canonical, "utf8")
      .replace(/^\s*<!--vault[\s\S]*?-->/i, "")
      .trim();
  }

  contentSignature(vaultId: string): string {
    const vault = this.vault(vaultId);
    const root = this.documentsRoot(vaultId);
    const extension = extensionFor(vault.format);
    const entries: string[] = [];
    const configFile = path.join(vault.repositoryPath, "vault.json");
    if (fs.existsSync(configFile)) {
      const stats = fs.statSync(configFile);
      entries.push(`vault.json:${stats.mtimeMs}:${stats.size}`);
    }

    const visit = (directory: string) => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.isSymbolicLink()) continue;
        if (directory === root && entry.name.toLowerCase() === QUICK_NOTES_FILE) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(absolute);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
          const stats = fs.statSync(absolute);
          entries.push(`${path.relative(root, absolute).split(path.sep).join("/")}:${stats.mtimeMs}:${stats.size}`);
        }
      }
    };

    visit(root);
    return entries.join("\n");
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
      const doc = this.document(vaultId, node.id);
      for (const target of linksForDocument(doc, ids)) {
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
    const authEnv = this.githubAuthEnv(vault.remoteUrl, vault.githubAccount);
    const git = async (args: string[]) =>
      (
        await execFileAsync("git", ["-C", vault.repositoryPath, ...args], {
          timeout: 120_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...authEnv },
        })
      ).stdout.trim();
    try {
      const upstream = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      await git(["fetch", "--quiet"]);
      const [ahead = 0, behind = 0] = (await git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]))
        .split(/\s+/)
        .map(Number);
      if (behind > 0) await git(["pull", "--ff-only", "--quiet"]);
      return { ahead, behind, pulled: behind > 0 };
    } catch (error) {
      throw new Error(
        syncFailureMessage(vault.remoteUrl, error, this.authenticatedFor(vault.remoteUrl, vault.githubAccount)),
        { cause: error },
      );
    }
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

  private describe(id: string, repositoryPath: string, fallbackName?: string): VaultSummary {
    const hasConfig = fs.existsSync(path.join(repositoryPath, "vault.json"));
    const config = this.config(repositoryPath);
    this.resolveDocumentsRoot(repositoryPath, config);
    const name = config.name?.trim() || fallbackName?.trim() || path.basename(repositoryPath);
    const format = formatFromConfig(config);
    const summary: VaultSummary = { id, name, repositoryPath, hasConfig, format };
    const defaultLanguage = cleanText(config.defaultLanguage);
    if (defaultLanguage) summary.defaultLanguage = defaultLanguage;
    const structure = sanitizeStructure(config.structure);
    if (structure) summary.structure = structure;
    return summary;
  }

  private documentsRoot(vaultId: string): string {
    const vault = this.vault(vaultId);
    // Active-vault operations create the documents directory on demand; this only
    // ever touches the one vault in use, never the whole registered list.
    return this.resolveDocumentsRoot(vault.repositoryPath, this.config(vault.repositoryPath), true);
  }

  // Resolve (and validate) the documents directory. With `create`, a missing
  // directory is created rather than rejected, so freshly cloned or empty vaults
  // open cleanly. Only write paths pass `create`; read paths keep the default so
  // a plain list() never mutates every registered repository.
  private resolveDocumentsRoot(repositoryPath: string, config: VaultConfig, create = false): string {
    const repositoryRoot = fs.realpathSync(repositoryPath);
    const configured = config.documentsDirectory || "documents";
    if (path.isAbsolute(configured)) throw new Error("documentsDirectory must be relative.");
    const candidate = path.resolve(repositoryRoot, configured);
    // Reject traversal before touching the filesystem so we never create a
    // directory outside the repository.
    if (!isWithin(repositoryRoot, candidate)) {
      throw new Error("Documents directory escapes the repository.");
    }
    if (!fs.existsSync(candidate)) {
      if (!create) throw new Error("Repository does not contain its configured documents directory.");
      fs.mkdirSync(candidate, { recursive: true });
    }
    // realpath only after the directory exists; a symlinked documents directory
    // that resolves outside the repository is still rejected here.
    const canonical = fs.realpathSync(candidate);
    if (!isWithin(repositoryRoot, canonical) || !fs.statSync(canonical).isDirectory()) {
      throw new Error("Documents directory escapes the repository.");
    }
    return canonical;
  }

  private walk(root: string, directory: string, meta: VaultStructure | undefined, format: VaultFormat): TreeNode[] {
    const nodes: TreeNode[] = [];
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.isSymbolicLink()) continue;
      if (directory === root && entry.name.toLowerCase() === QUICK_NOTES_FILE) continue;
      const absolute = path.join(directory, entry.name);
      const id = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        const directoryMeta = meta?.[entry.name];
        const children = this.walk(root, absolute, directoryMeta?.children, format);
        if (children.length) {
          const folder: TreeNode = {
            type: "folder",
            id,
            label: directoryMeta?.title || humanize(entry.name),
            children,
          };
          if (directoryMeta?.description) folder.description = directoryMeta.description;
          nodes.push(folder);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extensionFor(format))) {
        const source = fs.statSync(absolute).size <= MAX_DOCUMENT_BYTES ? fs.readFileSync(absolute, "utf8") : "";
        const meta = format === "markdown" ? parseMarkdownMeta(source).meta : parseMeta(source);
        nodes.push({
          type: "doc",
          id,
          label: format === "markdown" ? markdownTitleFor(source, entry.name) : titleFor(source, entry.name),
          date: meta.date ?? null,
          tags: meta.tags ?? [],
        });
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
