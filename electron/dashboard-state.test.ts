import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_NAMESPACE_DIRECTORY,
  DASHBOARD_SCHEMA_VERSION,
  DASHBOARD_STATE_MAX_BYTES,
} from "../src/dashboard-contracts";
import { DashboardStateService } from "./dashboard-state";
import { DashboardStorage } from "./dashboard-storage";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fixture(): { root: string; bundle: string; storage: DashboardStorage } {
  const root = temporaryDirectory();
  const dashboardRoot = path.join(root, ...DASHBOARD_NAMESPACE_DIRECTORY.split("/"));
  const bundle = path.join(dashboardRoot, "daily-focus");
  fs.mkdirSync(path.join(root, "documents"), { recursive: true });
  fs.mkdirSync(path.join(dashboardRoot, ".trash"), { recursive: true });
  fs.mkdirSync(bundle);
  fs.writeFileSync(
    path.join(root, "vault.json"),
    JSON.stringify({
      documentsDirectory: "documents",
      dashboards: { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY },
    }),
  );
  fs.writeFileSync(
    path.join(dashboardRoot, "registry.json"),
    JSON.stringify({ schemaVersion: DASHBOARD_SCHEMA_VERSION, dashboards: [{ id: "daily-focus" }] }),
  );
  fs.writeFileSync(
    path.join(bundle, "dashboard.json"),
    JSON.stringify({
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      id: "daily-focus",
      title: "Daily focus",
      icon: "target",
      color: "blue",
      kind: "personal-progress",
      entrypoint: "index.html",
      requestedCapabilities: ["state:read", "state:write"],
    }),
  );
  fs.writeFileSync(path.join(bundle, "index.html"), "<!doctype html><title>Focus</title>");
  return { root, bundle, storage: new DashboardStorage(root) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("DashboardStateService", () => {
  it("reads missing state as null and persists a contained JSON value", () => {
    const { bundle, storage } = fixture();
    const service = new DashboardStateService();

    expect(service.read(storage, "daily-focus")).toBeNull();
    service.write(storage, "daily-focus", "runtime-1", { goals: ["ship"], complete: false });

    expect(service.read(storage, "daily-focus")).toEqual({ goals: ["ship"], complete: false });
    expect(JSON.parse(fs.readFileSync(path.join(bundle, "state.json"), "utf8"))).toEqual({
      goals: ["ship"],
      complete: false,
    });
  });

  it("rejects malformed and oversized state without affecting other views", () => {
    const { bundle, storage } = fixture();
    const service = new DashboardStateService();
    fs.writeFileSync(path.join(bundle, "state.json"), "{bad json");
    expect(() => service.read(storage, "daily-focus")).toThrow("Dashboard state is invalid");

    fs.writeFileSync(path.join(bundle, "state.json"), `"${"x".repeat(1024 * 1024)}"`);
    expect(() => service.read(storage, "daily-focus")).toThrow("Dashboard state is invalid");
    expect(() => service.write(storage, "daily-focus", "runtime-1", "x".repeat(1024 * 1024))).toThrow(
      "Dashboard state is invalid",
    );
  });

  it("round-trips a state value at the exact persisted-byte limit and rejects one byte more", () => {
    const { bundle, storage } = fixture();
    const service = new DashboardStateService();
    const exact = "x".repeat(DASHBOARD_STATE_MAX_BYTES - 2);

    service.write(storage, "daily-focus", "runtime-1", exact);

    expect(fs.statSync(path.join(bundle, "state.json")).size).toBe(DASHBOARD_STATE_MAX_BYTES);
    expect(service.read(storage, "daily-focus")).toBe(exact);
    expect(() => service.write(storage, "daily-focus", "runtime-1", `${exact}x`)).toThrow("Dashboard state is invalid");
    expect(service.read(storage, "daily-focus")).toBe(exact);
  });

  it("rejects non-JSON values, cycles, sparse arrays, and non-plain objects", () => {
    const { storage } = fixture();
    const service = new DashboardStateService();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = new Array(2);
    sparse[1] = "value";

    for (const value of [undefined, Number.NaN, 1n, new Date(), cycle, sparse]) {
      expect(() => service.write(storage, "daily-focus", "runtime-1", value)).toThrow("Dashboard state is invalid");
    }
  });

  it("rejects traversal identifiers and a symlinked state file", () => {
    const { root, bundle, storage } = fixture();
    const service = new DashboardStateService();
    expect(() => service.write(storage, "../daily-focus", "runtime-1", null)).toThrow("Invalid dashboard ID");

    const outside = path.join(root, "outside.json");
    fs.writeFileSync(outside, "null");
    try {
      fs.symlinkSync(outside, path.join(bundle, "state.json"), "file");
    } catch {
      return;
    }
    expect(() => service.read(storage, "daily-focus")).toThrow(/symbolic links|invalid/i);
  });

  it("limits successful writes to thirty in each sliding runtime minute", () => {
    const { storage } = fixture();
    let now = 10_000;
    const service = new DashboardStateService(() => now);
    for (let index = 0; index < 30; index += 1) service.write(storage, "daily-focus", "runtime-1", index);
    expect(() => service.write(storage, "daily-focus", "runtime-1", 31)).toThrow("write rate exceeded");

    now += 60_000;
    expect(() => service.write(storage, "daily-focus", "runtime-1", 32)).not.toThrow();
    service.releaseRuntime("runtime-1");
  });

  it("keeps the previous state and cleans its sibling temporary when replacement is interrupted", () => {
    const { bundle, storage } = fixture();
    const service = new DashboardStateService();
    service.write(storage, "daily-focus", "runtime-1", { version: 1 });
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination === path.join(bundle, "state.json")) throw new Error("interrupted");
      return rename(source, destination);
    });

    expect(() => service.write(storage, "daily-focus", "runtime-1", { version: 2 })).toThrow("interrupted");
    expect(JSON.parse(fs.readFileSync(path.join(bundle, "state.json"), "utf8"))).toEqual({ version: 1 });
    expect(fs.readdirSync(bundle).filter((name) => name.startsWith(".state-"))).toEqual([]);
  });
});
