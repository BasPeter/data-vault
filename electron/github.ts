import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserWindow, safeStorage } from "electron";
import { normalizeStoredAuth, selectAccount } from "./github-auth";
import type {
  CreateRepoInput,
  GitHubDeviceFlowEvent,
  GitHubDeviceFlowStart,
  GitHubRepo,
  GitHubStatus,
} from "../src/types";

// Injected at build time by electron.vite.config.ts. Empty when no OAuth App is
// configured for the build, in which case GitHub sign-in is disabled. The device
// flow client id is public (not a secret), so shipping it in the bundle is safe.
declare const __GITHUB_CLIENT_ID__: string;

const CLIENT_ID =
  process.env.DATA_VAULT_GITHUB_CLIENT_ID ||
  (typeof __GITHUB_CLIENT_ID__ === "string" ? __GITHUB_CLIENT_ID__ : "") ||
  "";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_BASE = "https://api.github.com";
const ALLOWED_HOSTS = new Set(["github.com", "api.github.com"]);
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REPO_PAGES = 10;

// Raised on a 401 so callers can prompt the user to reconnect instead of showing
// a raw HTTP error. The offending account is removed before this propagates.
export class TokenRevokedError extends Error {
  constructor() {
    super("Your GitHub sign-in has expired or was revoked. Reconnect your GitHub account and try again.");
    this.name = "TokenRevokedError";
  }
}

// In-memory connected account. The token never leaves the main process except as
// a git auth header or an Authorization header to api.github.com.
type Account = {
  login: string;
  avatarUrl?: string;
  token: string;
};

// Persisted shape (github-auth.json). Each token is encrypted independently when
// safeStorage is available.
type StoredAuth = {
  version: 2;
  accounts: Array<{ login: string; avatarUrl?: string; encrypted: boolean; token: string }>;
};

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

function assertHostAllowed(url: string): void {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("Refusing to contact a malformed GitHub URL.");
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`Refusing to contact a non-GitHub host: ${host}`);
  }
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  assertHostAllowed(url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Data-Vault",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}.`);
  }
  return response.json();
}

export class GitHubService {
  private readonly authFile: string;
  private accounts: Account[] = [];
  private secure = true;
  // Generation guards retire a running poll loop when a new flow starts or the
  // user cancels, so a stale loop can never resurrect a cancelled sign-in.
  private flowGeneration = 0;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(userDataDirectory: string) {
    this.authFile = path.join(userDataDirectory, "github-auth.json");
    this.load();
  }

  isConfigured(): boolean {
    return CLIENT_ID.length > 0;
  }

  hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  // Choose which account's token authenticates a git operation: an exact account
  // login if given, else an account whose login matches the repository owner, else
  // the only connected account, else none. Returns the git extraheader value.
  authHeaderValue(account?: string, ownerHint?: string): string | null {
    const chosen = selectAccount(this.accounts, account, ownerHint);
    if (!chosen) return null;
    const basic = Buffer.from(`x-access-token:${chosen.token}`).toString("base64");
    return `AUTHORIZATION: basic ${basic}`;
  }

  getStatus(): GitHubStatus {
    return {
      configured: this.isConfigured(),
      secure: this.secure,
      accounts: this.accounts.map((entry) => ({ login: entry.login, avatarUrl: entry.avatarUrl })),
    };
  }

  async startDeviceFlow(): Promise<GitHubDeviceFlowStart> {
    if (!this.isConfigured()) {
      throw new Error("GitHub sign-in is not configured in this build.");
    }
    // Retire any in-flight flow before starting a new one.
    this.cancelDeviceFlow();
    const generation = ++this.flowGeneration;

    const raw = (await postForm(DEVICE_CODE_URL, {
      client_id: CLIENT_ID,
      scope: "repo",
    })) as Partial<DeviceCodeResponse>;
    if (!raw.device_code || !raw.user_code || !raw.verification_uri) {
      throw new Error("GitHub did not return a device code. Try again.");
    }
    const deviceCode = raw.device_code;
    const interval = Math.max(5, Number(raw.interval) || 5);
    const expiresInSeconds = Math.max(0, Number(raw.expires_in) || 900);

    this.schedulePoll(generation, deviceCode, interval, Date.now() + expiresInSeconds * 1000);

    return {
      userCode: raw.user_code,
      verificationUri: raw.verification_uri,
      expiresInSeconds,
    };
  }

  cancelDeviceFlow(): void {
    this.flowGeneration += 1;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(generation: number, deviceCode: string, intervalSeconds: number, expiresAt: number): void {
    this.pollTimer = setTimeout(
      () => void this.poll(generation, deviceCode, intervalSeconds, expiresAt),
      intervalSeconds * 1000,
    );
    this.pollTimer.unref?.();
  }

  private async poll(
    generation: number,
    deviceCode: string,
    intervalSeconds: number,
    expiresAt: number,
  ): Promise<void> {
    if (generation !== this.flowGeneration) return;
    if (Date.now() >= expiresAt) {
      this.publishDeviceFlow({ state: "expired", message: "The sign-in code expired. Start again." });
      return;
    }
    let result: Record<string, unknown>;
    try {
      result = (await postForm(ACCESS_TOKEN_URL, {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })) as Record<string, unknown>;
    } catch {
      // Transient network error: keep polling until the code expires.
      if (generation === this.flowGeneration) this.schedulePoll(generation, deviceCode, intervalSeconds, expiresAt);
      return;
    }
    if (generation !== this.flowGeneration) return;

    const accessToken = typeof result.access_token === "string" ? result.access_token : null;
    if (accessToken) {
      await this.completeConnection(accessToken);
      return;
    }

    const error = typeof result.error === "string" ? result.error : "";
    if (error === "authorization_pending") {
      this.schedulePoll(generation, deviceCode, intervalSeconds, expiresAt);
    } else if (error === "slow_down") {
      this.schedulePoll(generation, deviceCode, intervalSeconds + 5, expiresAt);
    } else if (error === "expired_token") {
      this.publishDeviceFlow({ state: "expired", message: "The sign-in code expired. Start again." });
    } else if (error === "access_denied") {
      this.publishDeviceFlow({ state: "denied", message: "Sign-in was cancelled." });
    } else {
      this.publishDeviceFlow({ state: "error", message: "GitHub sign-in failed. Try again." });
    }
  }

  private async completeConnection(token: string): Promise<void> {
    let login: string | undefined;
    let avatarUrl: string | undefined;
    try {
      const user = (await this.request(token, "/user")).data as { login?: string; avatar_url?: string };
      login = typeof user.login === "string" ? user.login : undefined;
      avatarUrl = typeof user.avatar_url === "string" ? user.avatar_url : undefined;
    } catch {
      // Leave login/avatar undefined; the account is still usable for git.
    }
    if (!login) {
      this.publishDeviceFlow({ state: "error", message: "Could not read your GitHub account. Try again." });
      return;
    }
    // Upsert by login so re-authorizing the same account refreshes its token.
    const existing = this.accounts.findIndex((entry) => entry.login === login);
    const account: Account = { login, avatarUrl, token };
    if (existing >= 0) this.accounts[existing] = account;
    else this.accounts.push(account);
    this.persist();
    this.publishDeviceFlow({ state: "connected" });
    this.publishStatus();
  }

  async disconnect(login: string): Promise<GitHubStatus> {
    this.accounts = this.accounts.filter((entry) => entry.login !== login);
    if (this.accounts.length === 0) {
      this.cancelDeviceFlow();
      fs.rmSync(this.authFile, { force: true });
    } else {
      this.persist();
    }
    this.publishStatus();
    return this.getStatus();
  }

  // Sign out of every connected account and discard the encrypted token file,
  // used by the application-wide settings reset. Any in-flight device flow is
  // retired so a pending sign-in cannot resurrect an account afterwards.
  reset(): void {
    this.cancelDeviceFlow();
    this.accounts = [];
    fs.rmSync(this.authFile, { force: true });
    this.publishStatus();
  }

  async listRepos(): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    for (const account of [...this.accounts]) {
      try {
        let next: string | null =
          `${API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
        for (let page = 0; next && page < MAX_REPO_PAGES; page += 1) {
          const { data, link } = await this.request(account.token, next);
          for (const entry of data as Array<Record<string, unknown>>) {
            const repo = this.toRepo(entry, account.login);
            if (repo.fullName.includes("/")) repos.push(repo);
          }
          next = link;
        }
      } catch (error) {
        // A single revoked/unreachable account must not blank the whole list; its
        // entry was already dropped by request() on a 401.
        if (!(error instanceof TokenRevokedError)) throw error;
      }
    }
    return repos;
  }

  async createRepo(input: CreateRepoInput): Promise<GitHubRepo> {
    const account = this.accounts.find((entry) => entry.login === input.account);
    if (!account) throw new Error("That GitHub account is no longer connected. Reconnect and try again.");
    const { data } = await this.request(account.token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: input.name, private: input.private, auto_init: true }),
    });
    return this.toRepo(data as Record<string, unknown>, account.login, input.name);
  }

  private toRepo(entry: Record<string, unknown>, account: string, fallbackName?: string): GitHubRepo {
    const owner = (entry.owner as { login?: string } | undefined)?.login ?? account;
    const name = typeof entry.name === "string" ? entry.name : (fallbackName ?? "");
    return {
      fullName: typeof entry.full_name === "string" ? entry.full_name : `${owner}/${name}`,
      name,
      owner,
      private: entry.private === true,
      cloneUrl: typeof entry.clone_url === "string" ? entry.clone_url : "",
      description: typeof entry.description === "string" ? entry.description : null,
      updatedAt: typeof entry.updated_at === "string" ? entry.updated_at : "",
      account,
    };
  }

  private async request(
    token: string,
    pathOrUrl: string,
    init?: RequestInit,
  ): Promise<{ data: unknown; link: string | null }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
    assertHostAllowed(url);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "Data-Vault",
          ...(init?.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Couldn't reach GitHub. Check your internet connection and try again.");
    }

    if (response.status === 401) {
      // This account's token is no longer valid: forget just that account.
      await this.disconnectByToken(token);
      throw new TokenRevokedError();
    }
    if (response.status === 422) {
      const detail = await this.errorDetail(response);
      throw new Error(detail || "GitHub rejected the request. The repository may already exist.");
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub rate limit reached. Try again in a few minutes.");
    }
    if (response.status === 403) {
      throw new Error(
        "Your GitHub authorization doesn't have access to this resource. Reconnect and approve repository access (and SAML SSO if required).",
      );
    }
    if (!response.ok) {
      const detail = await this.errorDetail(response);
      throw new Error(detail || `GitHub returned ${response.status} ${response.statusText}.`);
    }

    const linkHeader = response.headers.get("link");
    const next = linkHeader ? parseNextLink(linkHeader) : null;
    return { data: await response.json(), link: next };
  }

  private async disconnectByToken(token: string): Promise<void> {
    const account = this.accounts.find((entry) => entry.token === token);
    if (account) await this.disconnect(account.login);
  }

  private async errorDetail(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { message?: string };
      return typeof body.message === "string" ? body.message : null;
    } catch {
      return null;
    }
  }

  private publishStatus(): void {
    const status = this.getStatus();
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("github:status", status);
  }

  private publishDeviceFlow(event: GitHubDeviceFlowEvent): void {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("github:device-flow", event);
  }

  private decryptToken(stored: { encrypted: boolean; token: string }): string {
    if (stored.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("encryption unavailable");
      return safeStorage.decryptString(Buffer.from(stored.token, "base64"));
    }
    this.secure = false;
    return stored.token;
  }

  private load(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.authFile, "utf8"));
    } catch {
      return;
    }
    // Accept both the v2 list shape and the legacy single-account shape.
    const stored = normalizeStoredAuth(parsed);

    for (const entry of stored) {
      try {
        const token = this.decryptToken(entry);
        if (entry.login) this.accounts.push({ login: entry.login, avatarUrl: entry.avatarUrl, token });
      } catch {
        // Drop only the entry that fails to decrypt; keep the others.
      }
    }
    // Rewrite with whatever survived so a partially-corrupt file self-heals.
    if (this.accounts.length !== stored.length) {
      if (this.accounts.length === 0) fs.rmSync(this.authFile, { force: true });
      else this.persist();
    }
  }

  private persist(): void {
    if (this.accounts.length === 0) return;
    const encryptable = safeStorage.isEncryptionAvailable();
    this.secure = encryptable;
    const payload: StoredAuth = {
      version: 2,
      accounts: this.accounts.map((account) => ({
        login: account.login,
        avatarUrl: account.avatarUrl,
        encrypted: encryptable,
        token: encryptable ? safeStorage.encryptString(account.token).toString("base64") : account.token,
      })),
    };
    const temporary = `${this.authFile}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, this.authFile);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

function parseNextLink(header: string): string | null {
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) {
      try {
        if (new URL(match[1]).host === "api.github.com") return match[1];
      } catch {
        return null;
      }
    }
  }
  return null;
}
