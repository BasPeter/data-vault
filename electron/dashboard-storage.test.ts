import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardStorage } from "./dashboard-storage";
import {
  DASHBOARD_NAMESPACE_DIRECTORY,
  DASHBOARD_SCHEMA_VERSION,
  DASHBOARD_SECRET_ORIGIN_MAX_COUNT,
  type DashboardManifest,
} from "../src/dashboard-contracts";

const secretsFixturesRoot = path.join(process.cwd(), "tests", "fixtures", "dashboards");

// Fixtures are read as `unknown`: the hostile ones are deliberately shaped to
// violate `DashboardManifest`, which is exactly what these tests exercise.
function readSecretsFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(secretsFixturesRoot, name, "dashboard.json"), "utf8"));
}

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-"));
  temporaryDirectories.push(directory);
  return directory;
}

function namespacePath(root: string): string {
  return path.join(root, ...DASHBOARD_NAMESPACE_DIRECTORY.split("/"));
}

function configuredVault(documentsDirectory = "documents"): { root: string; storage: DashboardStorage } {
  const root = temporaryDirectory();
  fs.mkdirSync(path.join(root, documentsDirectory), { recursive: true });
  fs.writeFileSync(
    path.join(root, "vault.json"),
    JSON.stringify({
      schemaVersion: 1,
      documentsDirectory,
      dashboards: { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY },
    }),
  );
  const dashboardRoot = namespacePath(root);
  fs.mkdirSync(path.join(dashboardRoot, ".trash"), { recursive: true });
  fs.writeFileSync(
    path.join(dashboardRoot, "registry.json"),
    JSON.stringify({ schemaVersion: DASHBOARD_SCHEMA_VERSION, dashboards: [] }),
  );
  return { root, storage: new DashboardStorage(root) };
}

function writeBundle(root: string, manifest: DashboardManifest): void {
  const bundle = path.join(namespacePath(root), manifest.id);
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, "dashboard.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(bundle, "index.html"), "<!doctype html><title>Dashboard</title>");
  fs.writeFileSync(path.join(bundle, "app.js"), "document.body.dataset.ready = 'true';");
  fs.writeFileSync(
    path.join(namespacePath(root), "registry.json"),
    JSON.stringify({ schemaVersion: DASHBOARD_SCHEMA_VERSION, dashboards: [{ id: manifest.id }] }),
  );
}

const validManifest: DashboardManifest = {
  schemaVersion: DASHBOARD_SCHEMA_VERSION,
  id: "weekly-focus",
  title: "Weekly focus",
  icon: "target",
  color: "blue",
  kind: "personal-progress",
  entrypoint: "index.html",
  requestedCapabilities: ["state:read", "state:write"],
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("DashboardStorage discovery and ownership", () => {
  it("generates a fixed agent handoff for only the selected validated bundle", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);

    const bundle = path.join(namespacePath(root), validManifest.id);
    const handoff = storage.agentHandoff(validManifest.id);

    expect(handoff).toContain(`Work only inside this validated dashboard bundle:\n${bundle}`);
    expect(handoff).toContain("Use only the fixed window.dashboardApi methods");
    expect(handoff).toContain("denies network connections");
    expect(handoff).toContain("Never edit permission stores");
    expect(handoff).toContain("attempt to bypass capability approval");
    expect(handoff).toContain("write anywhere outside the bundle directory above");
    expect(handoff).not.toContain(path.join(namespacePath(root), "another-dashboard"));
  });

  // The authoring agent must be told it cannot read a secret, and must be steered
  // to the trusted panel instead of asking the user to paste a credential
  // somewhere the agent or the dashboard could then read it.
  it("tells an authoring agent how to declare secrets and that it can never read one", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);

    const handoff = storage.agentHandoff(validManifest.id);

    expect(handoff).toContain("secrets:use");
    expect(handoff).toContain("You cannot read a secret value");
    expect(handoff).toContain("secureFetch");
    expect(handoff).toContain("authorization-basic");
    expect(handoff).toContain("1–256 code units");
    expect(handoff).toContain("only the host composes the authorization value");
    expect(handoff).toContain("exact HTTPS origins");
    expect(handoff).toContain("trusted secrets panel");
    expect(handoff).toContain("Do not ask the user to paste a credential");
  });

  it("leaves an unconfigured vault without a dashboard namespace unchanged", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "documents"));
    fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ custom: { preserved: true } }));

    expect(new DashboardStorage(root).discover()).toEqual([]);
    expect(fs.existsSync(namespacePath(root))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, "vault.json"), "utf8"))).toEqual({
      custom: { preserved: true },
    });
  });

  it("fails closed instead of adopting an unowned or malformed namespace", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(namespacePath(root), { recursive: true });
    const storage = new DashboardStorage(root);

    expect(() => storage.discover()).toThrow("without ownership");

    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({ dashboards: { schemaVersion: 99, directory: DASHBOARD_NAMESPACE_DIRECTORY } }),
    );
    expect(() => storage.discover()).toThrow("Unsupported dashboard namespace");
  });

  it("strictly validates registry records and rejects duplicate IDs", () => {
    const { root, storage } = configuredVault();
    fs.writeFileSync(
      path.join(namespacePath(root), "registry.json"),
      JSON.stringify({
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        dashboards: [{ id: "same" }, { id: "same" }],
      }),
    );

    expect(() => storage.discover()).toThrow("Duplicate dashboard ID");
  });

  it("rejects documents directories equal to or below the dashboard namespace", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, ".data-vault", "dashboards", "documents"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({
        documentsDirectory: ".data-vault/dashboards/documents",
        dashboards: { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY },
      }),
    );

    expect(() => new DashboardStorage(root).discover()).toThrow("overlaps the dashboard namespace");
  });
});

describe("DashboardStorage bundle validation", () => {
  it("discovers a contained valid bundle in registry order", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);

    expect(storage.discover()).toEqual([validManifest]);
  });

  it("rejects hostile manifest fields, unsupported files, and missing entrypoints", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);
    const bundle = path.join(namespacePath(root), validManifest.id);

    fs.writeFileSync(path.join(bundle, "payload.exe"), "no");
    expect(() => storage.discover()).toThrow("unsupported file");
    fs.rmSync(path.join(bundle, "payload.exe"));

    fs.rmSync(path.join(bundle, "index.html"));
    expect(() => storage.discover()).toThrow("entrypoint not found");

    fs.writeFileSync(path.join(bundle, "index.html"), "ok");
    fs.writeFileSync(path.join(bundle, "dashboard.json"), JSON.stringify({ ...validManifest, title: "<script>" }));
    expect(() => storage.discover()).toThrow("Invalid dashboard title");
  });

  it("rejects bundle and entrypoint symlink escapes", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);
    const bundle = path.join(namespacePath(root), validManifest.id);
    const outside = path.join(root, "outside.html");
    fs.writeFileSync(outside, "outside");
    fs.rmSync(path.join(bundle, "index.html"));
    try {
      fs.symlinkSync(outside, path.join(bundle, "index.html"), "file");
    } catch {
      fs.mkdirSync(path.join(root, "outside-assets"));
      fs.symlinkSync(path.join(root, "outside-assets"), path.join(bundle, "assets"), "junction");
    }

    expect(() => storage.discover()).toThrow(/symbolic links|entrypoint/i);
  });
});

describe("DashboardStorage secret declarations", () => {
  it("accepts a manifest declaring bounded, normalized HTTPS secret origins", () => {
    const { root, storage } = configuredVault();
    const manifest = readSecretsFixture("valid-secrets") as DashboardManifest;
    writeBundle(root, manifest);

    expect(storage.discover()).toEqual([manifest]);
  });

  it("keeps an undeclared `secrets` field absent rather than defaulting to an empty array", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, validManifest);

    const [discovered] = storage.discover();
    expect(discovered).not.toHaveProperty("secrets");
  });

  it.each([
    ["a malformed secret name (lowercase, outside [A-Z0-9_])", "hostile-secret-name"],
    // A plain-HTTP origin would let the resolved secret travel over an
    // unencrypted channel; only exact HTTPS origins may receive it.
    ["a non-HTTPS origin", "hostile-secret-origin-http"],
    // A wildcard origin would let the declaration (and thus user consent)
    // cover an attacker-registered subdomain the user never approved.
    ["a wildcard origin", "hostile-secret-origin-wildcard"],
    // Userinfo in the origin is a classic URL-confusion vector for smuggling
    // credentials or misleading a reviewer about the real target host.
    ["an origin with embedded userinfo", "hostile-secret-origin-userinfo"],
    ["duplicate secret names in one manifest", "hostile-secret-duplicate-name"],
    ["more secrets than the fixed per-manifest bound", "hostile-secret-overcount"],
    ["an unsupported field inside a secret entry", "hostile-secret-extra-key"],
  ])("rejects a bundle safely without executing content for %s", (_reason, fixtureName) => {
    const { root, storage } = configuredVault();
    const manifest = readSecretsFixture(fixtureName) as DashboardManifest;
    writeBundle(root, manifest);

    // Discovery must fail closed: the whole namespace read throws rather than
    // silently dropping the offending dashboard from an otherwise-successful list.
    expect(() => storage.discover()).toThrow();
  });

  it("rejects a secret name that is otherwise well-formed but exceeds the length bound", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, {
      ...validManifest,
      id: "secret-name-too-long",
      requestedCapabilities: ["secrets:use"],
      secrets: [{ name: "A".repeat(65), origins: ["https://api.example.com"] }],
    } as DashboardManifest);

    expect(() => storage.discover()).toThrow("Invalid dashboard secret name");
  });

  it("rejects more origins on one secret than the fixed per-secret bound", () => {
    const { root, storage } = configuredVault();
    const origins = Array.from(
      { length: DASHBOARD_SECRET_ORIGIN_MAX_COUNT + 1 },
      (_, index) => `https://host-${index}.example.com`,
    );
    writeBundle(root, {
      ...validManifest,
      id: "secret-origin-overcount",
      requestedCapabilities: ["secrets:use"],
      secrets: [{ name: "EXAMPLE_TOKEN", origins }],
    } as DashboardManifest);

    expect(() => storage.discover()).toThrow("Invalid dashboard secret origins");
  });

  it("rejects a secret declared with no origins", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, {
      ...validManifest,
      id: "secret-no-origins",
      requestedCapabilities: ["secrets:use"],
      secrets: [{ name: "EXAMPLE_TOKEN", origins: [] }],
    } as DashboardManifest);

    expect(() => storage.discover()).toThrow("Invalid dashboard secret origins");
  });

  it("normalizes a declared origin to its exact form", () => {
    const { root, storage } = configuredVault();
    writeBundle(root, {
      ...validManifest,
      id: "secret-origin-normalized",
      requestedCapabilities: ["secrets:use"],
      secrets: [{ name: "EXAMPLE_TOKEN", origins: ["https://API.example.com/"] }],
    } as DashboardManifest);

    expect(storage.discover()[0].secrets).toEqual([{ name: "EXAMPLE_TOKEN", origins: ["https://api.example.com"] }]);
  });
});

describe("DashboardStorage lifecycle", () => {
  it("never removes pre-existing collision content during create rollback", () => {
    const { storage } = configuredVault();
    const existsSync = fs.existsSync;
    let collision: string | null = null;
    vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
      const file = String(candidate);
      if (
        collision === null &&
        path.dirname(file) === storage.namespaceRoot &&
        !path.basename(file).startsWith(".creating-") &&
        /^[0-9a-f-]{36}$/.test(path.basename(file))
      ) {
        collision = file;
        fs.mkdirSync(file);
        fs.writeFileSync(path.join(file, "do-not-delete.txt"), "pre-existing");
        return true;
      }
      return existsSync(candidate);
    });

    expect(() =>
      storage.create({ title: "Collision", icon: "chart", color: "blue", kind: "blank", location: "vault" }),
    ).toThrow("destination already exists");
    vi.restoreAllMocks();

    expect(collision).not.toBeNull();
    expect(fs.readFileSync(path.join(collision!, "do-not-delete.txt"), "utf8")).toBe("pre-existing");
    expect(JSON.parse(fs.readFileSync(path.join(storage.namespaceRoot, "registry.json"), "utf8"))).toEqual({
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      dashboards: [],
    });
  });

  it("creates an owned skeleton atomically and preserves unknown vault config fields", () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, "documents"));
    fs.writeFileSync(
      path.join(root, "vault.json"),
      JSON.stringify({ schemaVersion: 1, documentsDirectory: "documents", futureField: { keep: true } }),
    );
    const storage = new DashboardStorage(root);

    const created = storage.create({
      title: "My progress",
      icon: "check",
      color: "green",
      kind: "personal-progress",
      location: "vault",
    });

    expect(created.requestedCapabilities).toEqual(["state:read", "state:write"]);
    expect(storage.discover()).toEqual([created]);
    // New bundles must render with the user's light/dark scheme, not a fixed white canvas.
    expect(fs.readFileSync(path.join(storage.namespaceRoot, created.id, "styles.css"), "utf8")).toContain(
      "color-scheme: light dark",
    );
    expect(JSON.parse(fs.readFileSync(path.join(root, "vault.json"), "utf8"))).toMatchObject({
      futureField: { keep: true },
      dashboards: { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY },
    });
  });

  it("renames, reorders, and recoverably removes without changing stable IDs", () => {
    const { storage } = configuredVault();
    const first = storage.create({ title: "First", icon: "chart", color: "blue", kind: "blank", location: "vault" });
    const second = storage.create({
      title: "Second",
      icon: "compass",
      color: "purple",
      kind: "blank",
      location: "vault",
    });

    expect(storage.rename(first.id, "Renamed")).toMatchObject({ id: first.id, title: "Renamed" });
    expect(storage.reorder([second.id, first.id]).map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(() => storage.reorder([first.id, first.id])).toThrow("Invalid dashboard order");

    const removed = storage.remove(first.id, "remove-1");
    expect(removed.trashPath).toBe(`${DASHBOARD_NAMESPACE_DIRECTORY}/.trash/${first.id}-remove-1`);
    expect(storage.discover().map(({ id }) => id)).toEqual([second.id]);
    expect(fs.existsSync(path.join(storage.repositoryRoot, ...removed.trashPath.split("/")))).toBe(true);
  });

  it("preflights trash collisions and rolls the bundle move back when registry replacement fails", () => {
    const { storage } = configuredVault();
    const created = storage.create({ title: "Keep", icon: "chart", color: "slate", kind: "blank", location: "vault" });
    const collision = path.join(storage.namespaceRoot, ".trash", `${created.id}-collision`);
    fs.mkdirSync(collision);

    expect(() => storage.remove(created.id, "collision")).toThrow("destination already exists");
    expect(storage.discover()).toHaveLength(1);

    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination === path.join(storage.namespaceRoot, "registry.json")) throw new Error("simulated failure");
      return rename(source, destination);
    });
    expect(() => storage.remove(created.id, "rollback")).toThrow("simulated failure");
    vi.restoreAllMocks();
    expect(storage.discover()).toHaveLength(1);
    expect(fs.existsSync(path.join(storage.namespaceRoot, created.id))).toBe(true);
  });
});

describe("DashboardStorage app-local namespace", () => {
  // App-local dashboards have no vault.json to activate them (unlike the
  // vault namespace): ownership is the namespace directory itself, one level
  // below the given app-local root, keyed by the vault key. This is the
  // mechanism that keeps a private, per-installation dashboard set entirely
  // outside any vault repository.
  it("resolves the namespace directly under the given root, keyed by the vault key, with no vault.json involved", () => {
    const appLocalRoot = temporaryDirectory();
    const vaultKey = "a".repeat(64);
    const storage = new DashboardStorage({ appLocalRoot, vaultKey });

    expect(storage.location).toBe("local");
    expect(storage.namespaceRoot).toBe(path.join(fs.realpathSync(appLocalRoot), vaultKey));
    expect(storage.isConfigured()).toBe(false);
    expect(storage.discover()).toEqual([]);

    const created = storage.create({ title: "Local", icon: "chart", color: "blue", kind: "blank", location: "local" });

    expect(storage.isConfigured()).toBe(true);
    expect(fs.existsSync(path.join(appLocalRoot, vaultKey, created.id, "dashboard.json"))).toBe(true);
    // No vault.json is ever written for an app-local namespace.
    expect(fs.existsSync(path.join(appLocalRoot, "vault.json"))).toBe(false);
    expect(storage.discover()).toEqual([created]);
  });

  // A vault key always comes from the HMAC digest DashboardPermissionStore
  // derives; validating its shape here — rather than trusting the caller —
  // keeps a malformed value from ever being joined into a filesystem path.
  it("rejects a malformed vault key before it can be joined into a filesystem path", () => {
    const appLocalRoot = temporaryDirectory();

    expect(() => new DashboardStorage({ appLocalRoot, vaultKey: "not-a-hex-key" })).toThrow(
      "Invalid dashboard vault key",
    );
    expect(() => new DashboardStorage({ appLocalRoot, vaultKey: "../../etc" })).toThrow("Invalid dashboard vault key");
    expect(fs.readdirSync(appLocalRoot)).toEqual([]);
  });

  // Without a vault.json flag to distinguish "never used" from "corrupted",
  // the app-local namespace must fail closed purely from what is physically
  // on disk — exactly like the vault namespace's own wrong-type and
  // incomplete-content checks.
  it("fails closed on wrong-type or incomplete pre-existing content, mirroring the vault namespace", () => {
    const appLocalRoot = temporaryDirectory();
    const vaultKey = "b".repeat(64);

    fs.writeFileSync(path.join(appLocalRoot, vaultKey), "not a directory");
    expect(() => new DashboardStorage({ appLocalRoot, vaultKey }).discover()).toThrow();
    fs.rmSync(path.join(appLocalRoot, vaultKey));

    fs.mkdirSync(path.join(appLocalRoot, vaultKey));
    const incomplete = new DashboardStorage({ appLocalRoot, vaultKey });
    expect(() => incomplete.discover()).toThrow("Incomplete dashboard namespace");
    expect(() =>
      incomplete.create({ title: "X", icon: "chart", color: "blue", kind: "blank", location: "local" }),
    ).toThrow("Incomplete dashboard namespace");
  });

  it("adopts a copied bundle byte-for-byte and rolls back a partial destination on failure", () => {
    const sourceRoot = temporaryDirectory();
    fs.mkdirSync(path.join(sourceRoot, "bundle"));
    fs.writeFileSync(path.join(sourceRoot, "bundle", "dashboard.json"), JSON.stringify(validManifest));
    fs.writeFileSync(path.join(sourceRoot, "bundle", "index.html"), "<!doctype html><title>Dashboard</title>");
    fs.writeFileSync(path.join(sourceRoot, "bundle", "app.js"), "document.body.dataset.ready = 'true';");
    fs.writeFileSync(path.join(sourceRoot, "bundle", "state.json"), JSON.stringify({ progress: 1 }));

    const appLocalRoot = temporaryDirectory();
    const vaultKey = "c".repeat(64);
    const storage = new DashboardStorage({ appLocalRoot, vaultKey });
    const sourceBundle = path.join(sourceRoot, "bundle");

    const rename = fs.renameSync;
    const destination = path.join(appLocalRoot, vaultKey, validManifest.id);
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (to === destination) throw new Error("simulated adopt failure");
      return rename(from, to);
    });
    expect(() => storage.adopt(sourceBundle, validManifest.id)).toThrow("simulated adopt failure");
    vi.restoreAllMocks();
    // A failure before registration completes rolls back every destination
    // artifact — including the namespace this call activated — rather than
    // leaving a half-registered bundle behind.
    expect(fs.existsSync(path.join(appLocalRoot, vaultKey))).toBe(false);

    const adopted = storage.adopt(sourceBundle, validManifest.id);
    expect(adopted).toEqual(validManifest);
    expect(storage.discover()).toEqual([validManifest]);
    expect(JSON.parse(fs.readFileSync(path.join(destination, "state.json"), "utf8"))).toEqual({ progress: 1 });
    expect(fs.readFileSync(path.join(destination, "app.js"), "utf8")).toBe(
      fs.readFileSync(path.join(sourceBundle, "app.js"), "utf8"),
    );
  });
});
