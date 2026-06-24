// Pure helpers for the GitHub auth store, kept free of any `electron` import so
// they can be unit-tested directly. The encryption/keychain and IPC concerns
// live in electron/github.ts.

export type StoredAccount = {
  login: string;
  avatarUrl?: string;
  encrypted: boolean;
  token: string;
};

type StoredAuthV2 = { version: 2; accounts: StoredAccount[] };
// Legacy single-account shape written by the first iteration of this feature.
type LegacyStoredAuth = { encrypted?: boolean; token?: string; login?: string; avatarUrl?: string };

// Normalise the persisted file into a flat account list, accepting both the v2
// list shape and the legacy single-account shape. Returns [] for anything else.
export function normalizeStoredAuth(parsed: unknown): StoredAccount[] {
  if (!parsed || typeof parsed !== "object") return [];
  const accounts = (parsed as StoredAuthV2).accounts;
  if (Array.isArray(accounts)) {
    return accounts.filter(
      (entry): entry is StoredAccount =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as StoredAccount).login === "string" &&
        typeof (entry as StoredAccount).token === "string" &&
        typeof (entry as StoredAccount).encrypted === "boolean",
    );
  }
  const legacy = parsed as LegacyStoredAuth;
  if (typeof legacy.token === "string") {
    return [
      {
        login: typeof legacy.login === "string" ? legacy.login : "",
        avatarUrl: typeof legacy.avatarUrl === "string" ? legacy.avatarUrl : undefined,
        encrypted: legacy.encrypted === true,
        token: legacy.token,
      },
    ];
  }
  return [];
}

// Choose which connected account authenticates an operation: an exact account
// login if given, else an account whose login matches the repository owner, else
// the only connected account, else none.
export function selectAccount<T extends { login: string }>(
  accounts: T[],
  account?: string,
  ownerHint?: string,
): T | undefined {
  return (
    (account ? accounts.find((entry) => entry.login === account) : undefined) ||
    (ownerHint ? accounts.find((entry) => entry.login.toLowerCase() === ownerHint.toLowerCase()) : undefined) ||
    (accounts.length === 1 ? accounts[0] : undefined)
  );
}
