import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorage } from "electron";
import {
  OpenCodeCredentialStore,
  OpenCodeCredentialsUnavailableError,
  OpenCodeSetupService,
} from "./opencode-credentials";
import { OpenCodeClientError } from "./opencode-client";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) => value.toString().replace("encrypted:", "")),
  },
}));

const directories: string[] = [];
function directory(): string {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-opencode-"));
  directories.push(result);
  return result;
}

afterEach(() => {
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue("gnome_libsecret");
  vi.clearAllMocks();
  for (const item of directories.splice(0)) fs.rmSync(item, { recursive: true, force: true });
});

describe("OpenCodeCredentialStore", () => {
  it("persists one encrypted username/password record without exposing credentials or Authorization", () => {
    const userData = directory();
    const store = new OpenCodeCredentialStore(userData, "linux");
    store.save({ port: 4096, username: "alice", password: "correct horse battery staple" });
    const persisted = fs.readFileSync(path.join(userData, "opencode-credentials.json"), "utf8");
    expect(persisted).not.toContain("alice");
    expect(persisted).not.toContain("correct horse battery staple");
    expect(persisted).not.toContain("Authorization");
    expect(store.load()).toEqual({ port: 4096, username: "alice", password: "correct horse battery staple" });
  });

  it.each(["basic_text", "unknown", "plaintext", "basic"])(
    'refuses Linux backend "%s" and writes nothing',
    (backend) => {
      const userData = directory();
      vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue(backend as never);
      expect(() =>
        new OpenCodeCredentialStore(userData, "linux").save({ port: 4096, username: "alice", password: "password" }),
      ).toThrow(OpenCodeCredentialsUnavailableError);
      expect(fs.existsSync(path.join(userData, "opencode-credentials.json"))).toBe(false);
    },
  );

  it.each(["darwin", "win32"] as const)("fails closed on %s when documented encryption is unavailable", (platform) => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    const userData = directory();
    expect(() =>
      new OpenCodeCredentialStore(userData, platform).save({ port: 4096, username: "alice", password: "password" }),
    ).toThrow(OpenCodeCredentialsUnavailableError);
    expect(fs.existsSync(path.join(userData, "opencode-credentials.json"))).toBe(false);
  });

  it.each(["darwin", "win32"] as const)("persists and loads one encrypted credential record on %s", (platform) => {
    const userData = directory();
    const store = new OpenCodeCredentialStore(userData, platform);
    store.save({ port: 4096, username: "alice", password: "password" });
    expect(store.load()).toEqual({ port: 4096, username: "alice", password: "password" });
    expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it("checks the actual Linux selected backend on every load and save", () => {
    const userData = directory();
    const store = new OpenCodeCredentialStore(userData, "linux");
    store.save({ port: 4096, username: "alice", password: "password" });
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue("basic_text");
    expect(store.load()).toBeUndefined();
    expect(safeStorage.getSelectedStorageBackend).toHaveBeenCalledTimes(2);
  });

  it("health-gates persistence and keeps credentials absent when setup health fails", async () => {
    const userData = directory();
    const health = vi.fn(async () => {
      throw new Error("remote credentials must not escape");
    });
    const service = new OpenCodeSetupService(new OpenCodeCredentialStore(userData, "linux"), () => ({ health }));

    const rejected = service.save({ port: 4096, username: "alice", password: "password", disclosureAccepted: true });
    await expect(rejected).rejects.toThrow("OpenCode is unavailable.");
    try {
      await rejected;
    } catch (error) {
      expect(String(error)).not.toContain("remote credentials must not escape");
    }
    expect(health).toHaveBeenCalledOnce();
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(userData, "opencode-credentials.json"))).toBe(false);
  });

  it.each([
    ["authentication-failed", "OpenCode rejected these credentials"],
    ["incompatible", "OpenCode version is incompatible"],
    ["unavailable", "OpenCode is unavailable"],
  ] as const)("preserves the known %s health code without remote details", async (code, message) => {
    const secret = "remote credential detail";
    const health = vi.fn(async () => {
      throw new OpenCodeClientError(secret, code);
    });
    const service = new OpenCodeSetupService(new OpenCodeCredentialStore(directory(), "linux"), () => ({ health }));

    await expect(
      service.save({ port: 4096, username: "alice", password: "password", disclosureAccepted: true }),
    ).rejects.toMatchObject({ code, message: expect.stringContaining(message) });
    await expect(
      service.save({ port: 4096, username: "alice", password: "password", disclosureAccepted: true }),
    ).rejects.not.toThrow(secret);
  });

  it("rejects disclosure and malformed setup before health or encryption", async () => {
    const health = vi.fn(async () => undefined);
    const service = new OpenCodeSetupService(new OpenCodeCredentialStore(directory(), "linux"), () => ({ health }));
    for (const input of [
      { port: 4096, username: "alice", password: "password", disclosureAccepted: false },
      { port: 0, username: "alice", password: "password", disclosureAccepted: true },
      { port: 4096, username: "", password: "password", disclosureAccepted: true },
      { port: 4096, username: "alice", password: "", disclosureAccepted: true },
    ]) {
      await expect(service.save(input)).rejects.toThrow("OpenCode setup is invalid.");
    }
    expect(health).not.toHaveBeenCalled();
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
  });

  it.each(["linux", "darwin", "win32"] as const)(
    "never discloses credentials, ciphertext, or Basic authorization in %s failures",
    (platform) => {
      const username = "alice";
      const password = "correct horse battery staple";
      const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      const userData = directory();
      const store = new OpenCodeCredentialStore(userData, platform);
      store.save({ port: 4096, username, password });
      const ciphertext = (
        JSON.parse(fs.readFileSync(path.join(userData, "opencode-credentials.json"), "utf8")) as { ciphertext: string }
      ).ciphertext;
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
      const error = (() => {
        try {
          store.save({ port: 4096, username, password });
        } catch (caught) {
          return caught;
        }
        throw new Error("Expected unavailable storage.");
      })();
      const output = String(error);
      for (const secret of [username, password, ciphertext, authorization, "Authorization"])
        expect(output).not.toContain(secret);
    },
  );
});
