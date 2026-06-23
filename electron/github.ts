import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import type { GitHubLoginStart, GitHubRepo, GitHubStatus } from "../src/types";

const CLIENT_ID = "Ov23li5xnCrnD5Sl5FNh";
const SCOPES = "repo read:user";
const API_VERSION = "2022-11-28";

type PendingLogin = {
  deviceCode: string;
  interval: number;
  expiresAt: number;
};

type StoredAuth = {
  token: string;
};

type GitHubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
};

type GitHubRepoResponse = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string | null;
  description: string | null;
  updated_at: string;
};

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

function normalizeRepositoryName(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error("Use a repository name with letters, numbers, dots, dashes, or underscores.");
  }
  return trimmed;
}

function mapRepo(repo: GitHubRepoResponse): GitHubRepo {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: repo.default_branch,
    description: repo.description,
    updatedAt: repo.updated_at,
  };
}

export class GitHubService {
  private readonly authFile: string;
  private pendingLogin: PendingLogin | null = null;

  constructor(private readonly userDataDirectory: string) {
    this.authFile = path.join(userDataDirectory, "github-auth.json");
  }

  async status(): Promise<GitHubStatus> {
    const token = this.readToken();
    if (!token) return { authenticated: false };
    try {
      const { user, scopes } = await this.fetchUser(token);
      return {
        authenticated: true,
        login: user.login,
        name: user.name ?? undefined,
        avatarUrl: user.avatar_url,
        scopes,
      };
    } catch {
      this.clearToken();
      return { authenticated: false };
    }
  }

  async startLogin(): Promise<GitHubLoginStart> {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody({ client_id: CLIENT_ID, scope: SCOPES }),
    });
    if (!response.ok) throw new Error(`GitHub login failed (${response.status}).`);
    const body = await response.json() as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      expires_in?: number;
      interval?: number;
      error?: string;
      error_description?: string;
    };
    if (body.error) throw new Error(body.error_description ?? body.error);
    if (!body.device_code || !body.user_code || !body.verification_uri || !body.expires_in) {
      throw new Error("GitHub returned an incomplete login response.");
    }
    const expiresAt = Date.now() + body.expires_in * 1000;
    this.pendingLogin = {
      deviceCode: body.device_code,
      interval: body.interval ?? 5,
      expiresAt,
    };
    return {
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async completeLogin(): Promise<GitHubStatus> {
    if (!this.pendingLogin) throw new Error("Start GitHub login first.");
    let interval = this.pendingLogin.interval;
    while (Date.now() < this.pendingLogin.expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody({
          client_id: CLIENT_ID,
          device_code: this.pendingLogin.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      if (!response.ok) throw new Error(`GitHub login failed (${response.status}).`);
      const body = await response.json() as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (body.access_token) {
        this.writeToken(body.access_token);
        this.pendingLogin = null;
        return this.status();
      }
      if (body.error === "authorization_pending") continue;
      if (body.error === "slow_down") {
        interval += 5;
        continue;
      }
      if (body.error === "expired_token") break;
      throw new Error(body.error_description ?? body.error ?? "GitHub login failed.");
    }
    this.pendingLogin = null;
    throw new Error("GitHub login expired. Start again and enter the new code.");
  }

  logout(): GitHubStatus {
    this.pendingLogin = null;
    this.clearToken();
    return { authenticated: false };
  }

  async repositories(): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const batch = await this.api<GitHubRepoResponse[]>(
        `/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
      );
      repos.push(...batch.map(mapRepo));
      if (batch.length < 100) break;
    }
    return repos;
  }

  async createRepository(input: { name: string; private: boolean; description?: string }): Promise<GitHubRepo> {
    const name = normalizeRepositoryName(input.name);
    const repo = await this.api<GitHubRepoResponse>("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        private: input.private,
        description: input.description?.trim() || undefined,
        auto_init: false,
      }),
    });
    return mapRepo(repo);
  }

  async withGitAuth<T>(callback: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
    const token = this.requireToken();
    const script = path.join(this.userDataDirectory, process.platform === "win32" ? "github-askpass.cmd" : "github-askpass.sh");
    const content = process.platform === "win32"
      ? "@echo off\r\necho %* | findstr /I \"Username\" >nul\r\nif not errorlevel 1 (echo x-access-token & exit /b 0)\r\necho %DATA_VAULT_GITHUB_TOKEN%\r\n"
      : "#!/bin/sh\ncase \"$*\" in\n  *Username*) printf '%s\\n' x-access-token ;;\n  *) printf '%s\\n' \"$DATA_VAULT_GITHUB_TOKEN\" ;;\nesac\n";
    fs.mkdirSync(this.userDataDirectory, { recursive: true });
    fs.writeFileSync(script, content, { mode: 0o700 });
    try {
      return await callback({
        GIT_ASKPASS: script,
        GIT_TERMINAL_PROMPT: "0",
        DATA_VAULT_GITHUB_TOKEN: token,
      });
    } finally {
      fs.rmSync(script, { force: true });
    }
  }

  private async api<T>(resource: string, init: RequestInit = {}): Promise<T> {
    const token = this.requireToken();
    const response = await fetch(`https://api.github.com${resource}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION,
        ...init.headers,
      },
    });
    if (!response.ok) {
      let message = `GitHub request failed (${response.status}).`;
      try {
        const body = await response.json() as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // Keep the generic HTTP message.
      }
      throw new Error(message);
    }
    return await response.json() as T;
  }

  private async fetchUser(token: string): Promise<{ user: GitHubUser; scopes: string[] }> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
    if (!response.ok) throw new Error("GitHub token is no longer valid.");
    const scopes = response.headers.get("x-oauth-scopes")?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [];
    return { user: await response.json() as GitHubUser, scopes };
  }

  private requireToken(): string {
    const token = this.readToken();
    if (!token) throw new Error("Connect GitHub first.");
    return token;
  }

  private readToken(): string | null {
    const stored = this.readStoredAuth();
    return stored?.token ?? null;
  }

  private writeToken(token: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure token storage is unavailable on this device.");
    }
    fs.mkdirSync(this.userDataDirectory, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify({ token }));
    const temporary = `${this.authFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ encrypted: encrypted.toString("base64") }), { mode: 0o600 });
    fs.renameSync(temporary, this.authFile);
  }

  private readStoredAuth(): StoredAuth | null {
    try {
      if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(this.authFile)) return null;
      const raw = JSON.parse(fs.readFileSync(this.authFile, "utf8")) as { encrypted?: string };
      if (!raw.encrypted) return null;
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw.encrypted, "base64"))) as StoredAuth;
    } catch {
      return null;
    }
  }

  private clearToken(): void {
    fs.rmSync(this.authFile, { force: true });
  }
}
