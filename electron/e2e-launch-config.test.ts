import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { e2eElectronArgs } from "../tests/e2e/electron-app";

const INSECURE_BACKEND = "basic";

describe("E2E Electron launch configuration", () => {
  it("uses the OS-backed GNOME libsecret backend instead of Electron basic storage", () => {
    const args = e2eElectronArgs("/tmp/data-vault-e2e");

    expect(args).toContain("--password-store=gnome-libsecret");
    expect(args).not.toContain(`--password-store=${INSECURE_BACKEND}`);
  });

  // The command-line switch above is not sufficient on its own: Playwright's
  // Electron loader appends the insecure backend at runtime and overwrites it,
  // which is why asserting only on the switch kept passing while the suite ran
  // on plaintext storage.
  //
  // These tests lock in the intended launch shape. They inspect our own
  // arguments only, so they cannot observe the harness and would still pass if
  // a Playwright upgrade defeated the preload. The backend assertion in
  // dashboard-storage-secrets.spec.ts is the actual regression detector.
  it("injects the password-store preload ahead of the app entry so it outlives Playwright's loader", () => {
    const args = e2eElectronArgs("/tmp/data-vault-e2e");
    const requireFlagIndex = args.indexOf("-r");
    const preloadPath = args[requireFlagIndex + 1];
    const entryIndex = args.findIndex((arg) => arg.endsWith("index.js"));

    expect(requireFlagIndex).toBeGreaterThanOrEqual(0);
    expect(preloadPath).toMatch(/password-store\.cjs$/);
    expect(requireFlagIndex).toBeLessThan(entryIndex);
  });

  it("has a preload that selects the OS-backed backend and never the insecure one", () => {
    const args = e2eElectronArgs("/tmp/data-vault-e2e");
    const preloadPath = args[args.indexOf("-r") + 1];
    const source = fs.readFileSync(preloadPath, "utf8");

    expect(source).toMatch(/appendSwitch\("password-store", "gnome-libsecret"\)/);
    expect(source).not.toMatch(new RegExp(`appendSwitch\\(\\s*"password-store"\\s*,\\s*"${INSECURE_BACKEND}"`));
  });
});
