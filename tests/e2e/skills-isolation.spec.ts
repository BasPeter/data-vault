import { existsSync } from "node:fs";
import path from "node:path";
import { cleanup, launchApp } from "./electron-app";
import { expect, test } from "@playwright/test";

// Regression: generated agent skills install to the home directory, which the
// `--user-data-dir` switch does not isolate. An unguarded run therefore wrote
// over the developer's real ~/.claude and ~/.codex skills. Under test the app
// must keep them inside the throwaway user-data dir instead.
test("installs generated skills inside the throwaway user-data dir, not the real home", async ({}, testInfo) => {
  const launch = await launchApp({ seedVault: true });
  try {
    // The app auto-installs skills on startup, mirrored for Claude and Codex.
    for (const base of [".claude", ".codex"]) {
      for (const skill of ["vault-guide", "document-reviewer"]) {
        const skillFile = path.join(launch.userDataDir, base, "skills", skill, "SKILL.md");
        await expect.poll(() => existsSync(skillFile)).toBe(true);
      }
    }
  } finally {
    await launch.app.close();
    cleanup(launch);
  }
});
