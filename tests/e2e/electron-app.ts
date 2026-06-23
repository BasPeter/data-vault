import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const mainEntry = path.join(repoRoot, "out", "main", "index.js");
const fixtureVault = path.join(repoRoot, "tests", "fixtures", "vault");
const screenshotsDir = path.join(repoRoot, "screenshots");

// A fixed identity so seeded registries are predictable across runs.
export const SEEDED_VAULT_ID = "00000000-0000-4000-8000-000000000001";
export const SEEDED_VAULT_NAME = "Example Vault";

export type AppLaunch = {
  app: ElectronApplication;
  page: Page;
  /** Throwaway copy of the fixture vault that tests may freely mutate. */
  vaultDir: string;
  /** Throwaway Electron `userData` directory for this launch. */
  userDataDir: string;
};

/**
 * Launch the built Electron app against disposable directories.
 *
 * Electron honours the Chromium `--user-data-dir` switch, which lets each test
 * run with an isolated registry and no shared state. When `seedVault` is true a
 * `vaults.json` pointing at a fresh copy of the fixture vault is written before
 * launch, so the app opens straight into the workspace; otherwise it starts on
 * the onboarding screen.
 *
 * Pass `reuse` to relaunch against directories from an earlier launch (keeping
 * the registry and any on-disk edits to the vault), which lets a test simulate
 * restarting the app after editing `vault.json`.
 */
export async function launchApp(
  options: { seedVault?: boolean; reuse?: { userDataDir: string; vaultDir: string } } = {},
): Promise<AppLaunch> {
  const seedVault = options.seedVault ?? true;
  const userDataDir = options.reuse?.userDataDir ?? mkdtempSync(path.join(tmpdir(), "data-vault-e2e-data-"));
  const vaultDir = options.reuse?.vaultDir ?? mkdtempSync(path.join(tmpdir(), "data-vault-e2e-vault-"));
  if (!options.reuse) cpSync(fixtureVault, vaultDir, { recursive: true });

  if (seedVault) {
    const registry = {
      vaults: [{ id: SEEDED_VAULT_ID, name: SEEDED_VAULT_NAME, repositoryPath: vaultDir }],
    };
    writeFileSync(path.join(userDataDir, "vaults.json"), `${JSON.stringify(registry, null, 2)}\n`);
  }

  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NODE_ENV: "test" },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return { app, page, vaultDir, userDataDir };
}

/**
 * Replace the native directory picker so the "Open local repository" flow
 * resolves to a fixture path instead of blocking on an OS dialog. Runs in the
 * privileged main-process context and touches no shipped application code.
 */
export async function stubDirectoryDialog(app: ElectronApplication, directory: string): Promise<void> {
  await app.evaluate(async ({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, directory);
}

/**
 * Capture a named screenshot on passing tests too (unlike the automatic
 * `only-on-failure` capture). The image is both attached to the Playwright HTML
 * report and written as a flat PNG under `screenshots/`, so CI can upload an
 * easily browsable gallery of every flow as its own artifact.
 */
export async function captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot();
  await testInfo.attach(name, { body, contentType: "image/png" });
  mkdirSync(screenshotsDir, { recursive: true });
  writeFileSync(path.join(screenshotsDir, `${name}.png`), body);
}

export function cleanup(launch: AppLaunch): void {
  rmSync(launch.userDataDir, { recursive: true, force: true });
  rmSync(launch.vaultDir, { recursive: true, force: true });
}

/**
 * Test fixture that launches the app with a seeded vault and tears everything
 * down afterwards. Specs that need the onboarding screen call `launchApp` with
 * `{ seedVault: false }` directly instead of using this fixture.
 */
export const test = base.extend<{ appLaunch: AppLaunch }>({
  appLaunch: async ({}, use) => {
    const launch = await launchApp({ seedVault: true });
    await use(launch);
    await launch.app.close();
    cleanup(launch);
  },
});

export { expect } from "@playwright/test";
