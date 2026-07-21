import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, SEEDED_VAULT_ID, test } from "./electron-app";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "..", "fixtures", "dashboards");

function installBundleFiles(bundleDirectory: string): void {
  const source = path.join(fixtures, "valid-personal");
  for (const name of fs.readdirSync(source)) {
    if (name === "dashboard.json") continue;
    fs.copyFileSync(path.join(source, name), path.join(bundleDirectory, name));
  }
}

// Rewrite the generated manifest so the bundle declares a secret and requests
// the capability, which the create flow does not do on its own.
function declareSecret(bundleDirectory: string): void {
  const manifestPath = path.join(bundleDirectory, "dashboard.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.requestedCapabilities = ["state:read", "state:write", "secrets:use"];
  manifest.secrets = [{ name: "E2E_TOKEN", origins: ["https://api.example.com"] }];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test.beforeEach(async ({ appLaunch }) => {
  // Report the selected backend alongside the assertion: it distinguishes "no
  // OS backend was selected at all" from "a backend was selected but the key
  // could not be derived", which the boolean alone cannot.
  const storage = await appLaunch.app.evaluate(({ safeStorage }) => ({
    available: safeStorage.isEncryptionAvailable(),
    backend: process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : process.platform,
  }));
  expect(
    storage.available,
    `E2E requires OS-backed safeStorage; check the Linux Secret Service setup. Selected backend: ${storage.backend}`,
  ).toBe(true);
});

test("an app-local dashboard is usable but never written into the vault repository", async ({ appLaunch }) => {
  const { page, vaultDir } = appLaunch;

  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Private notes",
        icon: "lightbulb",
        color: "purple",
        kind: "personal-progress",
        location: "local",
      }),
    SEEDED_VAULT_ID,
  );

  // The whole point of app-local storage: nothing lands in the synced repository.
  expect(fs.existsSync(path.join(vaultDir, ".data-vault", "dashboards", dashboard.id))).toBe(false);

  const listed = await page.evaluate((vaultId) => window.vaultApi.dashboards(vaultId), SEEDED_VAULT_ID);
  expect(listed.find((entry) => entry.id === dashboard.id)?.location).toBe("local");

  await page.reload();
  await expect(page.getByRole("button", { name: "Open Private notes dashboard" })).toBeVisible();
});

test("moving a dashboard between locations relocates its bundle in both directions", async ({ appLaunch }) => {
  const { page, vaultDir } = appLaunch;
  const vaultBundle = (id: string) => path.join(vaultDir, ".data-vault", "dashboards", id);

  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Movable",
        icon: "compass",
        color: "blue",
        kind: "blank",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  expect(fs.existsSync(vaultBundle(dashboard.id))).toBe(true);

  const moved = await page.evaluate(
    ({ vaultId, dashboardId }) => window.vaultApi.moveDashboard(vaultId, dashboardId, "local"),
    { vaultId: SEEDED_VAULT_ID, dashboardId: dashboard.id },
  );
  expect(moved.location).toBe("local");
  expect(moved.id).toBe(dashboard.id);
  expect(fs.existsSync(vaultBundle(dashboard.id))).toBe(false);

  const back = await page.evaluate(
    ({ vaultId, dashboardId }) => window.vaultApi.moveDashboard(vaultId, dashboardId, "vault"),
    { vaultId: SEEDED_VAULT_ID, dashboardId: dashboard.id },
  );
  expect(back.location).toBe("vault");
  expect(fs.existsSync(vaultBundle(dashboard.id))).toBe(true);
});

test("secrets are refused to an ungranted dashboard and never exposed by value", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;

  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Secret consumer",
        icon: "chart",
        color: "orange",
        kind: "personal-progress",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  const bundle = path.join(vaultDir, ".data-vault", "dashboards", dashboard.id);
  installBundleFiles(bundle);
  declareSecret(bundle);

  // Store a value through the trusted channel so a leak would have something to leak.
  const overview = await page.evaluate(() => window.vaultApi.setDashboardSecret("E2E_TOKEN", "e2e-secret-value"));
  expect(overview.secrets.find((secret) => secret.name === "E2E_TOKEN")?.set).toBe(true);
  // The overview is status-only; the value must not appear anywhere in it.
  expect(JSON.stringify(overview)).not.toContain("e2e-secret-value");

  await page.reload();
  await page.getByRole("button", { name: "Open Secret consumer dashboard" }).click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length))
    .toBe(1);

  // secrets:use was never granted, so both operations must be refused outright.
  const denied = await app.evaluate(async ({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    return runtime.executeJavaScript(`(async () => ({
      list: await window.dashboardApi.listSecrets().then(() => "allowed").catch(() => "denied"),
      fetch: await window.dashboardApi
        .secureFetch({
          url: "https://api.example.com/v1",
          method: "GET",
          secret: { name: "E2E_TOKEN", inject: { kind: "authorization-bearer" } },
        })
        .then((response) => JSON.stringify(response))
        .catch(() => "denied"),
    }))()`);
  });

  expect(denied.list).toBe("denied");
  expect(denied.fetch).toBe("denied");
  expect(JSON.stringify(denied)).not.toContain("e2e-secret-value");
});

test("the trusted secrets panel shows status without ever pre-filling a value", async ({ appLaunch }) => {
  const { page, vaultDir } = appLaunch;

  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Panel check",
        icon: "target",
        color: "green",
        kind: "personal-progress",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  declareSecret(path.join(vaultDir, ".data-vault", "dashboards", dashboard.id));
  await page.evaluate(() => window.vaultApi.setDashboardSecret("E2E_TOKEN", "e2e-secret-value"));
  await page.reload();

  await page.getByRole("button", { name: "Open Panel check dashboard" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Manage secrets…" }).click();

  const panel = page.getByRole("dialog", { name: "Dashboard secrets" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("E2E_TOKEN", { exact: true })).toBeVisible();
  await expect(panel.getByText("https://api.example.com")).toBeVisible();

  const input = panel.locator("#secret-E2E_TOKEN");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("type", "password");
  expect(await panel.textContent()).not.toContain("e2e-secret-value");
});

// A dashboard runs in a native view composited above the renderer, so a header
// popover drawn over its rectangle is invisible until the view is detached. This
// is not observable from the DOM — the popover is present and "visible" to
// Playwright either way — so the assertion has to be on the attached view count.
test("header overlays detach the dashboard view so they are not hidden behind it", async ({ appLaunch }) => {
  const { app, page } = appLaunch;
  const attachedViews = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);

  await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Overlay check",
        icon: "chart",
        color: "blue",
        kind: "blank",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  await page.reload();
  await page.getByRole("button", { name: "Open Overlay check dashboard" }).click();
  await expect.poll(attachedViews).toBe(1);

  // The git status panel: the report that prompted this test.
  await page.getByRole("button", { name: /uncommitted change|No uncommitted changes|check vault changes/ }).click();
  await expect.poll(attachedViews).toBe(0);
  // A detached view paints nothing, so the host must show a still in its place
  // or the user sees a black hole where the dashboard was.
  await expect(page.getByTestId("dashboard-snapshot")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(attachedViews).toBe(1);
  await expect(page.getByTestId("dashboard-snapshot")).toHaveCount(0);

  // The vault switcher shares the defect and the fix.
  await page.getByTestId("vault-switcher").click();
  await expect.poll(attachedViews).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(attachedViews).toBe(1);
});
