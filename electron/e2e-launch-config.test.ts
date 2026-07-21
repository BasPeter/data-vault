import { describe, expect, it } from "vitest";
import { e2eElectronArgs } from "../tests/e2e/electron-app";

describe("E2E Electron launch configuration", () => {
  it("uses the OS-backed GNOME libsecret backend instead of Electron basic storage", () => {
    const args = e2eElectronArgs("/tmp/data-vault-e2e");

    expect(args).toContain("--password-store=gnome-libsecret");
    expect(args).not.toContain("--password-store=basic");
  });
});
