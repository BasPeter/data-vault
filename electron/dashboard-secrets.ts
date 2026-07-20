import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import { DASHBOARD_SECRET_VALUE_MAX_LENGTH, DASHBOARD_SECRET_VALUE_MIN_LENGTH } from "../src/dashboard-contracts";

const SECRET_NAME = /^[A-Z0-9_]{1,64}$/;
const STORE_MAX_BYTES = 1024 * 1024;

type SecretRecord = { value: string };
type SecretFile = Record<string, SecretRecord>;

// Thrown by set() when OS-keychain-backed encryption is unavailable. The store
// refuses to persist anything in this case rather than falling back to
// plaintext (unlike electron/github.ts, which deliberately is not the pattern
// to follow here — see design.md D4).
export class DashboardSecretEncryptionUnavailableError extends Error {
  constructor() {
    super("Secret storage is unavailable because OS-backed encryption is not available on this machine.");
    this.name = "DashboardSecretEncryptionUnavailableError";
  }
}

// Thrown by set()/delete() when the store exists but cannot be read. Reads treat
// an unreadable store as empty, but a write must not: rewriting it from an empty
// baseline would silently discard every other stored secret.
export class DashboardSecretStoreUnreadableError extends Error {
  constructor() {
    super("Secret storage could not be read, so it was not modified.");
    this.name = "DashboardSecretStoreUnreadableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validateSecretName(value: string): string {
  if (typeof value !== "string" || !SECRET_NAME.test(value)) {
    throw new Error("Invalid dashboard secret name.");
  }
  return value;
}

// Strict parse: any malformed entry invalidates the whole file. The caller
// (read()) treats a thrown error as an empty store rather than propagating it,
// so a corrupt file fails safe instead of blocking every other operation.
function parseSecretFile(value: unknown): SecretFile {
  if (!isRecord(value)) throw new Error("Invalid dashboard secret store.");
  const result: SecretFile = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!SECRET_NAME.test(name)) throw new Error("Invalid dashboard secret store.");
    if (!isRecord(entry) || !exactKeys(entry, ["value"]) || typeof entry.value !== "string") {
      throw new Error("Invalid dashboard secret store.");
    }
    result[name] = { value: entry.value };
  }
  return result;
}

function atomicPrivateFile(file: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Windows does not provide POSIX permission bits; the private app-data location remains authoritative.
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Storage primitives only. Manifest-declared secret requirements, the
// union-of-installed-dashboards listing, and requiring-dashboard metadata are
// service-layer concerns that land in a later task, not here.
export class DashboardSecretStore {
  private readonly secretsFile: string;

  constructor(userDataDirectory: string) {
    this.secretsFile = path.join(userDataDirectory, "dashboard-secrets.json");
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  listStoredNames(): string[] {
    return Object.keys(this.read()).sort();
  }

  has(name: string): boolean {
    return validateSecretName(name) in this.read();
  }

  set(name: string, value: string): void {
    const validName = validateSecretName(name);
    // A minimum length keeps redaction meaningful: a one- or two-character secret
    // would shred every response it appears in, and makes response echoes a
    // guess-confirmation oracle.
    if (
      typeof value !== "string" ||
      value.length < DASHBOARD_SECRET_VALUE_MIN_LENGTH ||
      value.length > DASHBOARD_SECRET_VALUE_MAX_LENGTH
    ) {
      throw new Error("Invalid dashboard secret value.");
    }
    // Hard refusal, not a fallback: writing nothing is safer than writing plaintext.
    if (!this.isAvailable()) throw new DashboardSecretEncryptionUnavailableError();
    const current = this.readForMutation();
    const encrypted = safeStorage.encryptString(value).toString("base64");
    current[validName] = { value: encrypted };
    this.write(current);
  }

  delete(name: string): void {
    const validName = validateSecretName(name);
    const current = this.readForMutation();
    if (!(validName in current)) return;
    delete current[validName];
    this.write(current);
  }

  // INTERNAL, main-process-only. Decrypts and returns a stored secret value for
  // the future host-mediated secureFetch implementation. The returned value
  // must NEVER be placed in an IPC payload, API result, error message, or log
  // — it may only exist transiently in main-process memory during a
  // host-mediated request.
  resolve(name: string): string | undefined {
    const validName = validateSecretName(name);
    const entry = this.read()[validName];
    if (!entry) return undefined;
    if (!this.isAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(entry.value, "base64"));
    } catch {
      return undefined;
    }
  }

  private load(): { readable: boolean; file: SecretFile } {
    if (!fs.existsSync(this.secretsFile)) return { readable: true, file: {} };
    try {
      const stats = fs.lstatSync(this.secretsFile);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > STORE_MAX_BYTES) {
        return { readable: false, file: {} };
      }
      return { readable: true, file: parseSecretFile(JSON.parse(fs.readFileSync(this.secretsFile, "utf8"))) };
    } catch {
      return { readable: false, file: {} };
    }
  }

  // Read paths fail safe as an empty store: do not throw, do not delete the file.
  private read(): SecretFile {
    return this.load().file;
  }

  private readForMutation(): SecretFile {
    const loaded = this.load();
    if (!loaded.readable) throw new DashboardSecretStoreUnreadableError();
    return loaded.file;
  }

  private write(file: SecretFile): void {
    const encoded = `${JSON.stringify(file, null, 2)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > STORE_MAX_BYTES) {
      throw new Error("Dashboard secret store is too large.");
    }
    atomicPrivateFile(this.secretsFile, encoded);
  }
}
