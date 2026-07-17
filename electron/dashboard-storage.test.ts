import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardStorage } from "./dashboard-storage";
import {
  DASHBOARD_NAMESPACE_DIRECTORY,
  DASHBOARD_SCHEMA_VERSION,
  type DashboardManifest,
} from "../src/dashboard-contracts";

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

    expect(() => storage.create({ title: "Collision", icon: "chart", color: "blue", kind: "blank" })).toThrow(
      "destination already exists",
    );
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
    const first = storage.create({ title: "First", icon: "chart", color: "blue", kind: "blank" });
    const second = storage.create({ title: "Second", icon: "compass", color: "purple", kind: "blank" });

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
    const created = storage.create({ title: "Keep", icon: "chart", color: "slate", kind: "blank" });
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
