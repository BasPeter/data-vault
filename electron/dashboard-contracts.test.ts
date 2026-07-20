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
  DASHBOARD_SECRET_MAX_COUNT,
  DASHBOARD_SECRET_NAME_PATTERN,
  DASHBOARD_SECRET_ORIGIN_MAX_COUNT,
  DASHBOARD_SECRET_ORIGIN_MAX_LENGTH,
  type DashboardManifest,
} from "../src/dashboard-contracts";

const fixturesRoot = path.join(process.cwd(), "tests", "fixtures", "dashboards");

// These fixtures exist solely to exercise manifest `secrets` validation and
// intentionally contain synthetic (and, for the hostile ones, deliberately
// invalid) HTTPS origins on the IANA-reserved example.* domains (RFC 2606).
// They are excluded from the "no remote URL" fixture-hygiene check below,
// which guards the runnable dashboard examples against referencing real
// remote services.
const SECRETS_FIXTURE_NAMES = new Set([
  "valid-secrets",
  "hostile-secret-name",
  "hostile-secret-origin-http",
  "hostile-secret-origin-wildcard",
  "hostile-secret-origin-userinfo",
  "hostile-secret-duplicate-name",
  "hostile-secret-overcount",
  "hostile-secret-extra-key",
]);

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
      "secrets:use",
    ]);
    expect(new Set([...DASHBOARD_LOCAL_CAPABILITY_IDS, ...DASHBOARD_PRIVILEGED_CAPABILITY_IDS])).toEqual(
      new Set(DASHBOARD_CAPABILITY_IDS),
    );
    // secrets:use gates listSecrets/secureFetch, both of which can reveal set/unset
    // status or move a credential; it must never be grantable as a local capability.
    expect(DASHBOARD_PRIVILEGED_CAPABILITY_IDS).toContain("secrets:use");
    expect(DASHBOARD_LOCAL_CAPABILITY_IDS).not.toContain("secrets:use");
  });

  it("keeps the secret declaration bounds fixed", () => {
    expect(DASHBOARD_SECRET_NAME_PATTERN.test("NOTION_TOKEN")).toBe(true);
    expect(DASHBOARD_SECRET_NAME_PATTERN.test("notion_token")).toBe(false);
    expect(DASHBOARD_SECRET_NAME_PATTERN.test("A".repeat(65))).toBe(false);
    expect(DASHBOARD_SECRET_MAX_COUNT).toBe(10);
    expect(DASHBOARD_SECRET_ORIGIN_MAX_COUNT).toBe(5);
    expect(DASHBOARD_SECRET_ORIGIN_MAX_LENGTH).toBe(253);
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
    const allEntries = fs
      .readdirSync(fixturesRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile());
    const allFixtureFiles = allEntries
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
      .join("\n");
    const runnableExampleFiles = allEntries
      .filter((entry) => !SECRETS_FIXTURE_NAMES.has(path.basename(entry.parentPath)))
      .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
      .join("\n");

    expect(allFixtureFiles).not.toMatch(/git@|file:\/\/|C:\\Users\\|\/Users\//i);
    expect(allFixtureFiles).not.toMatch(/password|credential|access[_-]?token|private[_-]?key/i);
    // Runnable dashboard examples (personal-progress/vault-intelligence/probe) must
    // never reference a remote URL; the secrets fixtures above are the sole,
    // deliberate exception and are scoped to reserved example.* domains below.
    expect(runnableExampleFiles).not.toMatch(/https?:\/\//i);
  });

  it("scopes secrets-fixture origins to reserved example.* domains, including deliberately invalid ones", () => {
    for (const name of SECRETS_FIXTURE_NAMES) {
      const raw = fs.readFileSync(path.join(fixturesRoot, name, "dashboard.json"), "utf8");
      const urls = raw.match(/https?:\/\/[^\s",]+/gi) ?? [];
      for (const url of urls) {
        // These synthetic origins (including intentionally-hostile ones) must stay
        // on IANA-reserved documentation domains rather than naming any real service.
        expect(url).toMatch(/^https?:\/\/(?:[\w-]+:[\w-]+@)?(?:\*\.)?([a-z0-9-]+\.)*example\.(com|org|net)$/i);
      }
    }
  });
});
