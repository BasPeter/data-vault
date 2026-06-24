import { describe, expect, it } from "vitest";
import { normalizeStoredAuth, selectAccount } from "./github-auth";

describe("selectAccount", () => {
  const accounts = [
    { login: "personal", token: "a" },
    { login: "WorkCo", token: "b" },
  ];

  it("prefers an exact account login", () => {
    expect(selectAccount(accounts, "WorkCo")?.token).toBe("b");
  });

  it("falls back to matching the repository owner case-insensitively", () => {
    expect(selectAccount(accounts, undefined, "workco")?.token).toBe("b");
    expect(selectAccount(accounts, undefined, "personal")?.token).toBe("a");
  });

  it("uses the only account when exactly one is connected and nothing matches", () => {
    expect(selectAccount([{ login: "solo", token: "z" }], undefined, "someone-else")?.token).toBe("z");
  });

  it("returns undefined when several accounts are connected and none match", () => {
    expect(selectAccount(accounts, undefined, "stranger")).toBeUndefined();
    expect(selectAccount([], "personal")).toBeUndefined();
  });
});

describe("normalizeStoredAuth", () => {
  it("reads the v2 account list", () => {
    const parsed = {
      version: 2,
      accounts: [
        { login: "a", encrypted: true, token: "x" },
        { login: "b", encrypted: false, token: "y", avatarUrl: "https://example.test/b.png" },
      ],
    };
    expect(normalizeStoredAuth(parsed)).toEqual(parsed.accounts);
  });

  it("migrates the legacy single-account shape into one account", () => {
    const result = normalizeStoredAuth({ encrypted: true, token: "x", login: "legacy", avatarUrl: "p" });
    expect(result).toEqual([{ login: "legacy", avatarUrl: "p", encrypted: true, token: "x" }]);
  });

  it("drops malformed entries and unknown shapes", () => {
    expect(normalizeStoredAuth(null)).toEqual([]);
    expect(normalizeStoredAuth({ version: 2, accounts: [{ login: "a" }] })).toEqual([]);
    expect(normalizeStoredAuth({ nothing: true })).toEqual([]);
  });
});
