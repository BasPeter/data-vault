import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_ASSET_MAX_FILE_BYTES,
  DASHBOARD_ASSET_MAX_FILES,
  DASHBOARD_CSP,
  DASHBOARD_SCHEME_PRIVILEGES,
  createDashboardAssetSnapshot,
  dashboardAssetHeaders,
  dashboardMimeType,
  normalizeDashboardProtocolPath,
  parseDashboardAssetUrl,
} from "./dashboard-runtime-assets";

const temporaryDirectories: string[] = [];

function bundle(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-runtime-"));
  temporaryDirectories.push(directory);
  fs.writeFileSync(path.join(directory, "dashboard.json"), "{}\n");
  fs.writeFileSync(path.join(directory, "index.html"), '<script src="app.js"></script>\n');
  fs.writeFileSync(path.join(directory, "app.js"), "globalThis.loaded = true;\n");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("dashboard runtime asset snapshot", () => {
  it("captures immutable bytes and changes the digest only on a new snapshot", () => {
    const directory = bundle();
    fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify({ private: "state" }));
    const first = createDashboardAssetSnapshot(directory);
    const original = new TextDecoder().decode(first.assets.get("app.js")?.bytes);

    fs.writeFileSync(path.join(directory, "app.js"), "globalThis.loaded = false;\n");

    expect(new TextDecoder().decode(first.assets.get("app.js")?.bytes)).toBe(original);
    expect(first.assets.has("state.json")).toBe(false);
    expect(createDashboardAssetSnapshot(directory).digest).not.toBe(first.digest);
  });

  it("enforces the file-count and per-file limits before a runtime starts", () => {
    const tooMany = bundle();
    for (let index = 0; index < DASHBOARD_ASSET_MAX_FILES; index += 1) {
      fs.writeFileSync(path.join(tooMany, `asset-${index}.json`), "null");
    }
    expect(() => createDashboardAssetSnapshot(tooMany)).toThrow("file-count limit exceeded");

    const tooLarge = bundle();
    fs.writeFileSync(path.join(tooLarge, "large.json"), Buffer.alloc(DASHBOARD_ASSET_MAX_FILE_BYTES + 1));
    expect(() => createDashboardAssetSnapshot(tooLarge)).toThrow("per-file size limit exceeded");
  });

  it("enforces the total immutable snapshot limit", () => {
    const directory = bundle();
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(path.join(directory, `large-${index}.json`), Buffer.alloc(DASHBOARD_ASSET_MAX_FILE_BYTES));
    }
    expect(() => createDashboardAssetSnapshot(directory)).toThrow("total size limit exceeded");
  });

  it("rejects links, unsupported types, and state exposure", () => {
    const unsupported = bundle();
    fs.writeFileSync(path.join(unsupported, "secret.txt"), "secret");
    expect(() => createDashboardAssetSnapshot(unsupported)).toThrow("unsupported MIME type");

    if (process.platform !== "win32") {
      const linked = bundle();
      fs.symlinkSync(path.join(linked, "app.js"), path.join(linked, "linked.js"));
      expect(() => createDashboardAssetSnapshot(linked)).toThrow("symbolic links");
    }
  });
});

describe("dashboard custom protocol policy", () => {
  it("keeps scheme privileges standard-and-secure only", () => {
    expect(DASHBOARD_SCHEME_PRIVILEGES).toEqual({ standard: true, secure: true });
    expect(Object.keys(DASHBOARD_SCHEME_PRIVILEGES)).toEqual(["standard", "secure"]);
  });

  it("normalizes encoded paths exactly once and rejects ambiguous paths", () => {
    expect(normalizeDashboardProtocolPath("/assets%2Fapp.js")).toBe("assets/app.js");
    for (const hostile of [
      "/%",
      "/%252e%252e%252fsecret.json",
      "/%2e%2e/secret.json",
      "/./app.js",
      "/assets//app.js",
      "/%00.js",
      "/C%3A%5Csecret.json",
      "//server/share.js",
    ]) {
      expect(normalizeDashboardProtocolPath(hostile), hostile).toBeNull();
    }
    expect(parseDashboardAssetUrl("vault-dashboard://one/app.js", "one")).toBe("app.js");
    expect(parseDashboardAssetUrl("vault-dashboard://two/app.js", "one")).toBeNull();
  });

  it("uses the exact CSP, nosniff, and MIME allowlist", () => {
    const headers = dashboardAssetHeaders("text/javascript");
    expect(headers.get("Content-Security-Policy")).toBe(DASHBOARD_CSP);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Content-Type")).toBe("text/javascript");
    expect(dashboardMimeType("image.jpeg")).toBe("image/jpeg");
    expect(dashboardMimeType("font.ttf")).toBeNull();
  });
});
