import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CAPABILITY_IDS,
  DASHBOARD_COLOR_IDS,
  DASHBOARD_ICON_IDS,
  DASHBOARD_KINDS,
  DASHBOARD_LOCAL_CAPABILITY_IDS,
  DASHBOARD_NAMESPACE_DIRECTORY,
  DASHBOARD_PRIVILEGED_CAPABILITY_IDS,
  DASHBOARD_SCHEMA_VERSION,
  type DashboardManifest,
} from "../src/dashboard-contracts";

const fixturesRoot = path.join(process.cwd(), "tests", "fixtures", "dashboards");

function readFixtureManifest(name: string): DashboardManifest {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, name, "dashboard.json"), "utf8")) as DashboardManifest;
}

describe("dashboard contracts", () => {
  it("keeps the v1 namespace and capability boundary fixed", () => {
    expect(DASHBOARD_SCHEMA_VERSION).toBe(1);
    expect(DASHBOARD_NAMESPACE_DIRECTORY).toBe(".data-vault/dashboards");
    expect([...DASHBOARD_CAPABILITY_IDS]).toEqual([
      "state:read",
      "state:write",
      "vault:index:read",
      "vault:documents:read",
    ]);
    expect(new Set([...DASHBOARD_LOCAL_CAPABILITY_IDS, ...DASHBOARD_PRIVILEGED_CAPABILITY_IDS])).toEqual(
      new Set(DASHBOARD_CAPABILITY_IDS),
    );
  });

  it("provides valid personal and intelligence bundles plus a local hostile probe", () => {
    const personal = readFixtureManifest("valid-personal");
    const intelligence = readFixtureManifest("valid-intelligence");
    const hostile = readFixtureManifest("hostile");

    const fixtures = [
      { fixtureName: "valid-personal", expectedId: "weekly-focus", manifest: personal },
      { fixtureName: "valid-intelligence", expectedId: "project-map", manifest: intelligence },
      { fixtureName: "hostile", expectedId: "boundary-probe", manifest: hostile },
    ];

    for (const { fixtureName, expectedId, manifest } of fixtures) {
      expect(manifest.schemaVersion).toBe(DASHBOARD_SCHEMA_VERSION);
      expect(manifest.id).toBe(expectedId);
      expect(DASHBOARD_KINDS).toContain(manifest.kind);
      expect(DASHBOARD_ICON_IDS).toContain(manifest.icon);
      expect(DASHBOARD_COLOR_IDS).toContain(manifest.color);
      expect(manifest.entrypoint).toBe("index.html");
      expect(manifest.requestedCapabilities.every((capability) => DASHBOARD_CAPABILITY_IDS.includes(capability))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(fixturesRoot, fixtureName, manifest.entrypoint))).toBe(true);
    }

    expect(personal.requestedCapabilities).toEqual(["state:read", "state:write"]);
    expect(intelligence.requestedCapabilities).toEqual(["vault:index:read", "vault:documents:read"]);
    expect(hostile.requestedCapabilities).toEqual([]);
  });

  it("keeps synthetic fixtures free of personal paths, credentials, repository URLs, and remote assets", () => {
    const fixtureFiles = fs
      .readdirSync(fixturesRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
      .join("\n");

    expect(fixtureFiles).not.toMatch(/https?:\/\/|git@|file:\/\/|C:\\Users\\|\/Users\//i);
    expect(fixtureFiles).not.toMatch(/password|credential|access[_-]?token|private[_-]?key/i);
  });
});
