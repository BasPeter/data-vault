import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorage } from "electron";
import { DASHBOARD_SECRET_VALUE_MAX_LENGTH } from "../src/dashboard-contracts";
import {
  DashboardSecretEncryptionUnavailableError,
  DashboardSecretStore,
  DashboardSecretStoreUnreadableError,
} from "./dashboard-secrets";

// The "electron" package resolves to a binary path string outside an Electron
// runtime, so safeStorage must be mocked for these tests to run under Vitest.
// The fake cipher is deliberately distinguishable from plaintext so a test can
// assert the on-disk file never contains the original value.
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, "utf8")),
    decryptString: vi.fn((buffer: Buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("bad ciphertext");
      return text.slice(4);
    }),
  },
}));

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-secrets-"));
  temporaryDirectories.push(directory);
  return directory;
}

function secretsFile(userData: string): string {
  return path.join(userData, "dashboard-secrets.json");
}

afterEach(() => {
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
  vi.mocked(safeStorage.isEncryptionAvailable).mockClear();
  vi.mocked(safeStorage.encryptString).mockClear();
  vi.mocked(safeStorage.decryptString).mockClear();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("DashboardSecretStore", () => {
  it("encrypts values at rest so the persisted file never contains the plaintext value", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);

    store.set("NOTION_TOKEN", "super-secret-value");

    const persisted = fs.readFileSync(secretsFile(userData), "utf8");
    expect(persisted).not.toContain("super-secret-value");
    // Proves the fake cipher ran (rather than the plaintext being copied through
    // unchanged): the stored base64 blob decodes to the "enc:" prefixed cipher text.
    const stored = JSON.parse(persisted) as { NOTION_TOKEN: { value: string } };
    expect(Buffer.from(stored.NOTION_TOKEN.value, "base64").toString("utf8")).toBe("enc:super-secret-value");
    expect(store.resolve("NOTION_TOKEN")).toBe("super-secret-value");

    if (process.platform !== "win32") {
      expect(fs.statSync(secretsFile(userData)).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses to persist and writes nothing when OS encryption is unavailable", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

    expect(() => store.set("NOTION_TOKEN", "super-secret-value")).toThrow(DashboardSecretEncryptionUnavailableError);

    // No plaintext fallback: nothing was ever encrypted or written to disk.
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
    expect(fs.existsSync(secretsFile(userData))).toBe(false);
    expect(store.has("NOTION_TOKEN")).toBe(false);
    expect(store.listStoredNames()).toEqual([]);
  });

  it("leaves an existing store untouched when a later save is refused for unavailable encryption", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);
    store.set("NOTION_TOKEN", "first-value");
    const before = fs.readFileSync(secretsFile(userData), "utf8");

    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
    expect(() => store.set("OTHER_TOKEN", "second-value")).toThrow(DashboardSecretEncryptionUnavailableError);

    expect(fs.readFileSync(secretsFile(userData), "utf8")).toBe(before);
    expect(store.resolve("NOTION_TOKEN")).toBe("first-value");
  });

  it("supports a set, has, delete lifecycle and overwriting an existing name", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);

    expect(store.has("NOTION_TOKEN")).toBe(false);
    store.set("NOTION_TOKEN", "value-one");
    expect(store.has("NOTION_TOKEN")).toBe(true);
    expect(store.resolve("NOTION_TOKEN")).toBe("value-one");

    store.set("NOTION_TOKEN", "value-two");
    expect(store.resolve("NOTION_TOKEN")).toBe("value-two");
    expect(store.listStoredNames()).toEqual(["NOTION_TOKEN"]);

    store.delete("NOTION_TOKEN");
    expect(store.has("NOTION_TOKEN")).toBe(false);
    expect(store.resolve("NOTION_TOKEN")).toBeUndefined();
    expect(store.listStoredNames()).toEqual([]);

    // Deleting an already-absent name is a safe no-op, not an error.
    expect(() => store.delete("NOTION_TOKEN")).not.toThrow();
  });

  it("lists stored names only; no operation other than resolve returns a value", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);
    store.set("B_TOKEN", "value-b-long-enough");
    store.set("A_TOKEN", "value-a-long-enough");

    const names = store.listStoredNames();
    expect(names).toEqual(["A_TOKEN", "B_TOKEN"]);
    expect(JSON.stringify(names)).not.toContain("value-");
    expect(JSON.stringify(store.has("A_TOKEN"))).not.toContain("value-");
  });

  it("rejects malformed secret names on every name-taking operation", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);
    const badNames = ["", "lowercase", "has-dash", "has space", "a".repeat(65), "WITH!BANG"];

    for (const name of badNames) {
      expect(() => store.set(name, "value")).toThrow("Invalid dashboard secret name.");
      expect(() => store.has(name)).toThrow("Invalid dashboard secret name.");
      expect(() => store.delete(name)).toThrow("Invalid dashboard secret name.");
      expect(() => store.resolve(name)).toThrow("Invalid dashboard secret name.");
    }
    expect(fs.existsSync(secretsFile(userData))).toBe(false);
  });

  it("treats a corrupt or unparseable file as an empty store without throwing or deleting it", () => {
    const userData = temporaryDirectory();
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretsFile(userData), "{ not valid json");
    const store = new DashboardSecretStore(userData);

    expect(store.listStoredNames()).toEqual([]);
    expect(store.has("NOTION_TOKEN")).toBe(false);
    expect(store.resolve("NOTION_TOKEN")).toBeUndefined();
    // Reading a corrupt file must not delete or rewrite it.
    expect(fs.readFileSync(secretsFile(userData), "utf8")).toBe("{ not valid json");
  });

  // Reads fail safe as empty, but a write must not: rebuilding the file from an
  // empty baseline would silently destroy every other secret the user had saved.
  it("refuses to mutate an unreadable store rather than overwriting the other secrets", () => {
    const userData = temporaryDirectory();
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretsFile(userData), "{ not valid json");
    const store = new DashboardSecretStore(userData);

    expect(() => store.set("NOTION_TOKEN", "value-long-enough")).toThrow(DashboardSecretStoreUnreadableError);
    expect(() => store.delete("NOTION_TOKEN")).toThrow(DashboardSecretStoreUnreadableError);
    expect(fs.readFileSync(secretsFile(userData), "utf8")).toBe("{ not valid json");
  });

  it("rejects an out-of-bounds secret value", () => {
    const userData = temporaryDirectory();
    const store = new DashboardSecretStore(userData);

    expect(() => store.set("NOTION_TOKEN", "")).toThrow();
    // Too short to redact safely: a tiny value would shred matching responses.
    expect(() => store.set("NOTION_TOKEN", "short")).toThrow();
    expect(() => store.set("NOTION_TOKEN", "x".repeat(DASHBOARD_SECRET_VALUE_MAX_LENGTH + 1))).toThrow();
    expect(fs.existsSync(secretsFile(userData))).toBe(false);
  });

  it("treats a well-formed-JSON but wrong-shape file as an empty store", () => {
    const userData = temporaryDirectory();
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretsFile(userData), JSON.stringify({ NOTION_TOKEN: "not-an-object" }));
    const store = new DashboardSecretStore(userData);

    expect(store.listStoredNames()).toEqual([]);
    expect(store.has("NOTION_TOKEN")).toBe(false);
  });
});
