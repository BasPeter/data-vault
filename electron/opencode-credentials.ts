import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import { OpenCodeClient, OpenCodeClientError, validateOpenCodePort, type OpenCodeCredentials } from "./opencode-client";

type Platform = "linux" | "darwin" | "win32";
type StoredCredentials = Readonly<{ port: number; ciphertext: string }>;
const LINUX_KEYCHAIN_BACKENDS = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);

export class OpenCodeCredentialsUnavailableError extends Error {
  constructor() {
    super("OpenCode credential storage is unavailable on this system.");
    this.name = "OpenCodeCredentialsUnavailableError";
  }
}

export type OpenCodeSetupInput = OpenCodeCredentials & Readonly<{ disclosureAccepted: boolean }>;

function setupHealthError(error: unknown): OpenCodeClientError {
  if (error instanceof OpenCodeClientError) {
    switch (error.code) {
      case "authentication-failed":
        return new OpenCodeClientError(
          "OpenCode rejected these credentials. Check the username and password.",
          error.code,
        );
      case "incompatible":
        return new OpenCodeClientError(
          "This OpenCode version is incompatible. Update OpenCode, then try again.",
          error.code,
        );
      case "unavailable":
        return new OpenCodeClientError("OpenCode is unavailable. Start it separately, then try again.", error.code);
    }
  }
  return new OpenCodeClientError("OpenCode is unavailable. Start it separately, then try again.");
}

function available(platform: Platform): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (platform === "linux") return LINUX_KEYCHAIN_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  return platform === "darwin" || platform === "win32";
}

/**
 * Intended for the real Electron CI process, not mocked unit tests. The caller
 * must run it inside Electron after the test harness selected its keychain.
 */
export function verifyOpenCodeLinuxRuntimeBackend(): void {
  if (process.platform !== "linux") return;
  if (!safeStorage.isEncryptionAvailable() || !LINUX_KEYCHAIN_BACKENDS.has(safeStorage.getSelectedStorageBackend())) {
    throw new OpenCodeCredentialsUnavailableError();
  }
}

function validCredentials(value: unknown): value is OpenCodeCredentials {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  try {
    validateOpenCodePort(record.port);
  } catch {
    return false;
  }
  return (
    typeof record.username === "string" &&
    record.username.length >= 1 &&
    record.username.length <= 256 &&
    typeof record.password === "string" &&
    record.password.length >= 1 &&
    record.password.length <= 1024
  );
}

function validStored(value: unknown): value is StoredCredentials {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  try {
    validateOpenCodePort(record.port);
  } catch {
    return false;
  }
  return Object.keys(record).length === 2 && typeof record.ciphertext === "string" && record.ciphertext.length > 0;
}

function writePrivate(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Windows app-private data is the applicable protection boundary.
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export class OpenCodeCredentialStore {
  private readonly file: string;

  constructor(
    userDataDirectory: string,
    private readonly platform: Platform = process.platform as Platform,
  ) {
    this.file = path.join(userDataDirectory, "opencode-credentials.json");
  }

  assertAvailable(): void {
    if (!available(this.platform)) throw new OpenCodeCredentialsUnavailableError();
  }

  save(credentials: OpenCodeCredentials): void {
    this.assertAvailable();
    if (!validCredentials(credentials)) throw new Error("Invalid OpenCode credentials.");
    const ciphertext = safeStorage
      .encryptString(JSON.stringify({ username: credentials.username, password: credentials.password }))
      .toString("base64");
    writePrivate(this.file, `${JSON.stringify({ port: credentials.port, ciphertext })}\n`);
  }

  load(): OpenCodeCredentials | undefined {
    if (!available(this.platform) || !fs.existsSync(this.file)) return undefined;
    try {
      const stats = fs.lstatSync(this.file);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 16_384) return undefined;
      const stored: unknown = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!validStored(stored)) return undefined;
      const decrypted: unknown = JSON.parse(safeStorage.decryptString(Buffer.from(stored.ciphertext, "base64")));
      const credentials = { port: stored.port, ...(decrypted as object) };
      return validCredentials(credentials) ? credentials : undefined;
    } catch {
      return undefined;
    }
  }

  remove(): void {
    fs.rmSync(this.file, { force: true });
  }
}

/**
 * Saves credentials only after both the actual storage backend and the
 * authenticated OpenCode health check have succeeded. It is main-process-only;
 * callers must never return its credentials or client to IPC.
 */
export class OpenCodeSetupService {
  constructor(
    private readonly store: OpenCodeCredentialStore,
    private readonly createClient: (credentials: OpenCodeCredentials) => Pick<OpenCodeClient, "health"> = (
      credentials,
    ) => new OpenCodeClient(credentials),
  ) {}

  async save(input: OpenCodeSetupInput): Promise<void> {
    if (!input.disclosureAccepted || !validCredentials(input)) {
      throw new OpenCodeClientError("OpenCode setup is invalid.");
    }
    this.store.assertAvailable();
    try {
      await this.createClient(input).health();
    } catch (error) {
      throw setupHealthError(error);
    }
    this.store.save(input);
  }
}
