import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalDashboardCapabilityRequest,
  canonicalDashboardSecretRequest,
  dashboardCapabilityRequestDigest,
  DashboardPermissionStore,
  digestDashboardBundle,
  type DashboardPermissionContext,
} from "./dashboard-permissions";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-permissions-"));
  temporaryDirectories.push(directory);
  return directory;
}

function context(
  repositoryPath: string,
  overrides: Partial<DashboardPermissionContext> = {},
): DashboardPermissionContext {
  return {
    repositoryPath,
    dashboardId: "project-view",
    requestedCapabilities: ["vault:documents:read", "state:read", "vault:index:read"],
    bundleDigest: "a".repeat(64),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("dashboard permission identity", () => {
  it("canonicalizes capability order and binds digest bytes without state", () => {
    expect(canonicalDashboardCapabilityRequest(["vault:documents:read", "state:read", "vault:index:read"])).toEqual([
      "state:read",
      "vault:index:read",
      "vault:documents:read",
    ]);
    expect(dashboardCapabilityRequestDigest(["vault:index:read", "state:read"])).toBe(
      dashboardCapabilityRequestDigest(["state:read", "vault:index:read"]),
    );
    const first = digestDashboardBundle([
      { path: "state.json", bytes: Buffer.from("one") },
      { path: "index.html", bytes: Buffer.from("safe") },
    ]);
    const stateChanged = digestDashboardBundle([
      { path: "index.html", bytes: Buffer.from("safe") },
      { path: "state.json", bytes: Buffer.from("two") },
    ]);
    const codeChanged = digestDashboardBundle([{ path: "index.html", bytes: Buffer.from("changed") }]);
    expect(stateChanged).toBe(first);
    expect(codeChanged).not.toBe(first);
  });

  it("canonicalizes declared secrets order-independently by name, then by origin", () => {
    const a = [
      { name: "B_TOKEN", origins: ["https://two.example.com", "https://one.example.com"] },
      { name: "A_TOKEN", origins: ["https://api.example.com"] },
    ];
    const b = [
      { name: "A_TOKEN", origins: ["https://api.example.com"] },
      { name: "B_TOKEN", origins: ["https://one.example.com", "https://two.example.com"] },
    ];
    expect(canonicalDashboardSecretRequest(a)).toEqual(canonicalDashboardSecretRequest(b));
    expect(canonicalDashboardSecretRequest()).toEqual([]);
  });

  it("folds declared secrets into the digest, but only when at least one is declared", () => {
    // A dashboard that never declares a secret must keep exactly the digest it
    // had before this field existed, so upgrading the app cannot itself revoke
    // an existing grant for the overwhelming majority of (secret-free) dashboards.
    const withoutSecretsField = dashboardCapabilityRequestDigest(["state:read"]);
    const withEmptySecrets = dashboardCapabilityRequestDigest(["state:read"], []);
    expect(withEmptySecrets).toBe(withoutSecretsField);

    const declared = [{ name: "NOTION_TOKEN", origins: ["https://api.example.com"] }];
    expect(dashboardCapabilityRequestDigest(["state:read"], declared)).not.toBe(withoutSecretsField);
  });

  it("changes the digest when a declared secret is renamed or retargeted to a different origin", () => {
    // Renaming a secret or widening/changing its allowed origin must force new
    // trusted approval: the consent the user gave was for a specific name sent
    // to a specific, reviewed origin, not for "whatever this dashboard declares now".
    const base = [{ name: "NOTION_TOKEN", origins: ["https://api.example.com"] }];
    const renamed = [{ name: "OTHER_TOKEN", origins: ["https://api.example.com"] }];
    const retargeted = [{ name: "NOTION_TOKEN", origins: ["https://attacker.example.com"] }];

    const baseDigest = dashboardCapabilityRequestDigest(["state:read"], base);
    expect(dashboardCapabilityRequestDigest(["state:read"], renamed)).not.toBe(baseDigest);
    expect(dashboardCapabilityRequestDigest(["state:read"], retargeted)).not.toBe(baseDigest);
  });

  it("stores only a salted canonical-root key and grants in canonical order", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);

    expect(store.grant(context(repository), ["vault:documents:read", "vault:index:read"], ["docs/b.html"])).toEqual({
      schemaVersion: 1,
      capabilities: ["state:read", "vault:index:read", "vault:documents:read"],
      documentScope: "selected",
      selectedDocumentIds: ["docs/b.html"],
    });
    const persisted = fs.readFileSync(path.join(userData, "dashboard-permissions.json"), "utf8");
    expect(persisted).not.toContain(repository);
    expect(persisted).not.toContain("repositoryPath");
    expect(persisted).not.toContain("approved");
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(userData, "dashboard-permissions.json")).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(userData, "dashboard-permissions.salt")).mode & 0o777).toBe(0o600);
    }
  });

  it("invalidates grants across moves, clones, dashboard IDs, bundle replacement, and request changes", () => {
    const userData = temporaryDirectory();
    const original = temporaryDirectory();
    const clone = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const approved = context(original);
    store.grant(approved, ["vault:index:read", "vault:documents:read"], ["approved.html"]);

    expect(store.effective(context(clone)).capabilities).toEqual(["state:read"]);
    expect(store.effective(context(original, { dashboardId: "another-view" })).capabilities).toEqual(["state:read"]);
    expect(store.effective(context(original, { bundleDigest: "b".repeat(64) })).capabilities).toEqual(["state:read"]);
    expect(
      store.effective(context(original, { requestedCapabilities: ["state:read", "vault:documents:read"] }))
        .capabilities,
    ).toEqual(["state:read"]);

    const moved = path.join(path.dirname(original), `${path.basename(original)}-moved`);
    fs.renameSync(original, moved);
    temporaryDirectories.splice(temporaryDirectories.indexOf(original), 1, moved);
    expect(store.effective(context(moved)).capabilities).toEqual(["state:read"]);
  });

  it("fails closed for forged or malformed persisted grants", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    store.grant(context(repository), ["vault:index:read"]);
    const file = path.join(userData, "dashboard-permissions.json");
    const forged = JSON.parse(fs.readFileSync(file, "utf8"));
    forged.grants[0].repositoryApproved = true;
    fs.writeFileSync(file, JSON.stringify(forged));

    expect(store.effective(context(repository))).toEqual({
      schemaVersion: 1,
      capabilities: ["state:read"],
      documentScope: "selected",
      selectedDocumentIds: [],
    });
    expect(() => store.grant(context(repository), ["vault:index:read"])).toThrow("Invalid dashboard permission store");
  });

  it("revokes selected scope immediately for every store instance", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const first = new DashboardPermissionStore(userData);
    const second = new DashboardPermissionStore(userData);
    const grantContext = context(repository);
    first.grant(grantContext, ["vault:documents:read"], ["approved.html"]);
    expect(second.effective(grantContext).selectedDocumentIds).toEqual(["approved.html"]);

    first.revoke(grantContext);
    expect(second.effective(grantContext)).toEqual({
      schemaVersion: 1,
      capabilities: ["state:read"],
      documentScope: "selected",
      selectedDocumentIds: [],
    });
  });

  it("reads legacy grants as selected and round-trips canonical all scope", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const grantContext = context(repository);
    store.grant(grantContext, ["vault:documents:read"], ["legacy.html"]);
    const file = path.join(userData, "dashboard-permissions.json");
    const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
    delete legacy.grants[0].documentScope;
    fs.writeFileSync(file, JSON.stringify(legacy));

    expect(store.effective(grantContext)).toMatchObject({
      documentScope: "selected",
      selectedDocumentIds: ["legacy.html"],
    });

    expect(store.grant(grantContext, ["vault:documents:read"], ["ignored.html"], "all")).toMatchObject({
      documentScope: "all",
      selectedDocumentIds: [],
    });
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(persisted.grants).toHaveLength(1);
    expect(persisted.grants[0]).toMatchObject({ documentScope: "all", selectedDocumentIds: [] });
  });

  it("fails closed for an invalid persisted scope", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const grantContext = context(repository);
    store.grant(grantContext, ["vault:documents:read"], [], "all");
    const file = path.join(userData, "dashboard-permissions.json");
    const forged = JSON.parse(fs.readFileSync(file, "utf8"));
    forged.grants[0].documentScope = "manifest-controlled";
    fs.writeFileSync(file, JSON.stringify(forged));

    expect(store.effective(grantContext)).toMatchObject({ capabilities: ["state:read"], documentScope: "selected" });
    expect(() => store.grant(grantContext, ["vault:documents:read"], [], "all")).toThrow(
      "Invalid dashboard permission store",
    );
  });

  it("cannot regain an old grant after superseding and revoking the current dashboard tuple", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const oldTuple = context(repository, { bundleDigest: "1".repeat(64) });
    const currentTuple = context(repository, { bundleDigest: "2".repeat(64) });
    const otherDashboard = context(repository, {
      dashboardId: "other-dashboard",
      bundleDigest: "3".repeat(64),
    });

    store.grant(oldTuple, ["vault:index:read"]);
    store.grant(otherDashboard, ["vault:index:read"]);
    store.grant(currentTuple, ["vault:documents:read"], ["approved.html"]);

    // A new approval supersedes every older request/bundle identity for only this dashboard.
    expect(store.effective(oldTuple).capabilities).toEqual(["state:read"]);
    expect(store.effective(otherDashboard).capabilities).toEqual(["state:read", "vault:index:read"]);

    store.revoke(currentTuple);

    expect(store.effective(currentTuple).capabilities).toEqual(["state:read"]);
    // Reverting the repository to the previously approved bytes cannot restore authority.
    expect(store.effective(oldTuple).capabilities).toEqual(["state:read"]);
    expect(store.effective(otherDashboard).capabilities).toEqual(["state:read", "vault:index:read"]);
  });

  it("does not replace the last valid grant store when its atomic rename fails", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const grantContext = context(repository);
    store.grant(grantContext, ["vault:index:read"]);
    const permissionsFile = path.join(userData, "dashboard-permissions.json");
    const original = fs.readFileSync(permissionsFile, "utf8");
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination === permissionsFile) throw new Error("interrupted");
      return rename(source, destination);
    });

    expect(() => store.revoke(grantContext)).toThrow("interrupted");
    expect(fs.readFileSync(permissionsFile, "utf8")).toBe(original);
    expect(fs.readdirSync(userData).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps a granted secrets:use approval valid across a pure reordering of declared secrets and origins", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const declared = [
      { name: "A_TOKEN", origins: ["https://one.example.com", "https://two.example.com"] },
      { name: "B_TOKEN", origins: ["https://api.example.com"] },
    ];
    const approved = context(repository, { requestedCapabilities: ["secrets:use"], requestedSecrets: declared });
    store.grant(approved, ["secrets:use"]);

    const reordered = context(repository, {
      requestedCapabilities: ["secrets:use"],
      requestedSecrets: [
        { name: "B_TOKEN", origins: ["https://api.example.com"] },
        { name: "A_TOKEN", origins: ["https://two.example.com", "https://one.example.com"] },
      ],
    });
    expect(store.effective(reordered).capabilities).toContain("secrets:use");
  });

  it("revokes secrets:use when a declared origin is retargeted, so a dashboard cannot silently redirect where its secret is sent", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const approved = context(repository, {
      requestedCapabilities: ["secrets:use"],
      requestedSecrets: [{ name: "A_TOKEN", origins: ["https://api.example.com"] }],
    });
    store.grant(approved, ["secrets:use"]);

    const retargeted = context(repository, {
      requestedCapabilities: ["secrets:use"],
      requestedSecrets: [{ name: "A_TOKEN", origins: ["https://attacker.example.com"] }],
    });
    expect(store.effective(retargeted).capabilities).not.toContain("secrets:use");
  });

  it("revokes secrets:use when a declared secret is renamed", () => {
    const userData = temporaryDirectory();
    const repository = temporaryDirectory();
    const store = new DashboardPermissionStore(userData);
    const approved = context(repository, {
      requestedCapabilities: ["secrets:use"],
      requestedSecrets: [{ name: "A_TOKEN", origins: ["https://api.example.com"] }],
    });
    store.grant(approved, ["secrets:use"]);

    const renamed = context(repository, {
      requestedCapabilities: ["secrets:use"],
      requestedSecrets: [{ name: "B_TOKEN", origins: ["https://api.example.com"] }],
    });
    expect(store.effective(renamed).capabilities).not.toContain("secrets:use");
  });
});
