import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, expect, launchApp, SEEDED_VAULT_ID, test } from "./electron-app";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "..", "fixtures", "dashboards");

function installFixture(vaultDir: string, dashboardId: string, fixture: "valid-personal" | "valid-intelligence"): void {
  const source = path.join(fixtures, fixture);
  const target = path.join(vaultDir, ".data-vault", "dashboards", dashboardId);
  for (const name of fs.readdirSync(source)) {
    if (name === "dashboard.json") continue;
    fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
}

/** Open a dashboard through the real launcher, mounting the DashboardHost `<webview>`. */
async function openDashboardViaUi(page: import("@playwright/test").Page, title: string): Promise<void> {
  await page.reload();
  await page.getByRole("button", { name: `Open ${title} dashboard` }).click();
}

/** Whether a dashboard guest web contents is currently alive. */
function guestPresent(app: import("@playwright/test").ElectronApplication): Promise<boolean> {
  return app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((item) => item.getURL().startsWith("vault-dashboard://")),
  );
}

/** Whether the dashboard `<webview>` is hidden — the consent/trusted-flow state. */
function dashboardHidden(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const webview = document.querySelector<HTMLElement>('[data-testid="dashboard-webview"]');
    return webview ? getComputedStyle(webview).display === "none" : true;
  });
}

test("personal dashboard state survives a full application restart", async () => {
  const first = await launchApp();
  try {
    const dashboard = await first.page.evaluate(
      (vaultId) =>
        window.vaultApi.createDashboard(vaultId, {
          title: "Synthetic progress",
          icon: "target",
          color: "green",
          kind: "personal-progress",
          location: "vault",
        }),
      SEEDED_VAULT_ID,
    );
    installFixture(first.vaultDir, dashboard.id, "valid-personal");
    await openDashboardViaUi(first.page, "Synthetic progress");
    await expect.poll(() => guestPresent(first.app)).toBe(true);
    await first.app.evaluate(async ({ webContents }) => {
      const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
      if (!runtime) throw new Error("Dashboard runtime missing");
      await runtime.executeJavaScript("window.dashboardApi.writeState({ completed: true })");
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(first.vaultDir, ".data-vault", "dashboards", dashboard.id, "state.json"), "utf8"),
      ),
    ).toEqual({ completed: true });
    const firstProcess = first.app.process();
    const exited =
      firstProcess.exitCode === null
        ? new Promise<void>((resolve) => firstProcess.once("exit", () => resolve()))
        : Promise.resolve();
    await first.app.close();
    await exited;

    const second = await launchApp({ reuse: { userDataDir: first.userDataDir, vaultDir: first.vaultDir } });
    try {
      await second.page.getByRole("button", { name: "Open Synthetic progress dashboard" }).click();
      const state = await expect
        .poll(() =>
          second.app.evaluate(async ({ webContents }) => {
            const runtime = webContents
              .getAllWebContents()
              .find((item) => item.getURL().startsWith("vault-dashboard://"));
            return runtime ? runtime.executeJavaScript("window.dashboardApi.readState()") : null;
          }),
        )
        .toEqual({ completed: true });
      void state;
    } finally {
      await second.app.close();
    }
  } finally {
    cleanup(first);
  }
});

test("removal invalidates active authority before moving the bundle", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Remove active",
        icon: "check",
        color: "slate",
        kind: "blank",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  await page.reload();
  await page.getByRole("button", { name: "Open Remove active dashboard" }).click();
  await expect.poll(() => guestPresent(app)).toBe(true);
  const removal = await page.evaluate(
    ({ vaultId, dashboardId }) => window.vaultApi.removeDashboard(vaultId, dashboardId),
    { vaultId: SEEDED_VAULT_ID, dashboardId: dashboard.id },
  );
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toBeNull();
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeAuthorityCountForTesting())).toBe(0);
  expect(await guestPresent(app)).toBe(false);
  expect(fs.existsSync(path.join(vaultDir, ".data-vault", "dashboards", dashboard.id))).toBe(false);
  expect(fs.existsSync(path.join(vaultDir, removal.trashPath))).toBe(true);
});

test("a main-frame load failure remains visible in trusted recovery UI", async ({ appLaunch }) => {
  const { app, page } = appLaunch;
  await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Broken runtime",
        icon: "lightbulb",
        color: "orange",
        kind: "blank",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  await page.reload();
  await page.getByRole("button", { name: "Open Broken runtime dashboard" }).click();
  await expect.poll(() => guestPresent(app)).toBe(true);
  await app.evaluate(({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    runtime.emit("did-fail-load", {}, -105, "Synthetic load failure", runtime.getURL(), true);
  });
  await expect(page.getByRole("heading", { name: "Dashboard unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect.poll(() => guestPresent(app)).toBe(false);
});

test("vault intelligence returns the approved index and document while denying unapproved IDs", async ({
  appLaunch,
}) => {
  const { app, page, vaultDir } = appLaunch;
  const dashboard = await page.evaluate(
    (vaultId) =>
      window.vaultApi.createDashboard(vaultId, {
        title: "Synthetic intelligence",
        icon: "chart",
        color: "blue",
        kind: "vault-intelligence",
        location: "vault",
      }),
    SEEDED_VAULT_ID,
  );
  installFixture(vaultDir, dashboard.id, "valid-intelligence");
  await page.reload();
  await page.getByRole("button", { name: "Open Synthetic intelligence dashboard" }).click();
  await expect.poll(() => guestPresent(app)).toBe(true);
  await app.evaluate(async ({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    await runtime.executeJavaScript(
      "Promise.all([1, 2, 3].map(() => window.dashboardApi.readVaultIndex().catch(() => 'denied')))",
    );
  });
  await expect(page.getByRole("dialog", { name: "Manage dashboard access" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage access" }).click();
  await expect(page.getByRole("dialog", { name: "Manage dashboard access" })).toBeVisible();
  // Consent isolation: the dashboard webview is hidden (no pixels, no input
  // surface) and focus sits inside the trusted dialog while it is open.
  await expect.poll(() => dashboardHidden(page)).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Manage dashboard access" })).toHaveCount(0);
  await expect.poll(() => dashboardHidden(page)).toBe(false);

  // No readiness delay: closing consent must leave the same ready runtime
  // immediately available to a second trusted-flow action.
  await page.getByRole("button", { name: "Manage access" }).click();
  await expect(page.getByRole("dialog", { name: "Manage dashboard access" })).toBeVisible();
  await page.getByText("Vault index", { exact: true }).click();
  await page.getByText("Document contents", { exact: true }).click();
  await page.getByText("All documents", { exact: true }).click();
  await expect(
    page.getByText("Read all current and future documents until you change or revoke access."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save access" }).click();
  await page.getByRole("button", { name: "Reload dashboard" }).click();

  const result = await expect
    .poll(() =>
      app.evaluate(async ({ webContents }) => {
        const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
        if (!runtime) return null;
        return runtime.executeJavaScript(
          `({ titles: [...document.querySelectorAll('#documents li')].map((node) => node.textContent), approved: document.querySelector('#approved-document')?.textContent, denied: document.documentElement.dataset.unapproved })`,
        );
      }),
    )
    .toMatchObject({ denied: "denied" });
  void result;

  fs.writeFileSync(path.join(vaultDir, "documents", "future.html"), "<h1>Future document</h1>");
  await page.reload();
  await page.getByRole("button", { name: "Open Synthetic intelligence dashboard" }).click();
  await expect
    .poll(() =>
      app.evaluate(async ({ webContents }) => {
        const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
        if (!runtime) return "missing";
        return runtime.executeJavaScript(
          "window.dashboardApi.readDocuments(['future.html']).then((value) => value.documents[0]?.id, () => 'denied')",
        );
      }),
    )
    .toBe("future.html");

  const expensiveReadLimits = await app.evaluate(async ({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    return runtime.executeJavaScript(`(async () => {
      const concurrent = await Promise.allSettled([
        window.dashboardApi.readVaultIndex(),
        window.dashboardApi.readDocuments(["welcome.html"]),
      ]);
      const recovery = await window.dashboardApi.readVaultIndex().then(() => "fulfilled", () => "rejected");
      let fulfilled = 0;
      let rejected = 0;
      for (let index = 0; index < 40; index += 1) {
        await window.dashboardApi.readVaultIndex().then(() => { fulfilled += 1; }, () => { rejected += 1; });
      }
      return { concurrent: concurrent.map((item) => item.status).sort(), recovery, fulfilled, rejected };
    })()`);
  });
  expect(expensiveReadLimits.concurrent).toEqual(["fulfilled", "rejected"]);
  expect(expensiveReadLimits.recovery).toBe("fulfilled");
  expect(expensiveReadLimits.fulfilled).toBeGreaterThan(0);
  expect(expensiveReadLimits.rejected).toBeGreaterThan(0);

  const rateLimitedRuntimeId = await app.evaluate(
    ({ webContents }) =>
      webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"))?.id ?? null,
  );
  await page.getByRole("button", { name: "Reload dashboard" }).click();
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, previousId) => {
        const currentId =
          webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"))?.id ?? null;
        return currentId !== null && currentId !== previousId;
      }, rateLimitedRuntimeId),
    )
    .toBe(true);
  const recoveredAfterReload = await app.evaluate(async ({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    return runtime.executeJavaScript("window.dashboardApi.readVaultIndex().then(() => 'fulfilled', () => 'rejected')");
  });
  expect(recoveredAfterReload).toBe("fulfilled");

  await page.getByRole("button", { name: "Manage access" }).click();
  await page.getByText("Selected documents", { exact: true }).click();
  const allowed = page.getByRole("group", { name: "Allowed documents" });
  for (const checkbox of await allowed.getByRole("checkbox").all()) await checkbox.uncheck();
  await allowed.getByText("Welcome").click();
  await page.getByRole("button", { name: "Save access" }).click();
  await page.getByRole("button", { name: "Reload dashboard" }).click();
  await expect
    .poll(() =>
      app.evaluate(async ({ webContents }) => {
        const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
        if (!runtime) return "missing";
        return runtime.executeJavaScript(
          "window.dashboardApi.readDocuments(['future.html']).then(() => 'unexpected', () => 'denied')",
        );
      }),
    )
    .toBe("denied");

  await page.getByRole("button", { name: "Manage access" }).click();
  await page.getByRole("button", { name: "Revoke all" }).click();
  await expect.poll(() => dashboardHidden(page)).toBe(false);
  const revoked = await app.evaluate(async ({ webContents }) => {
    const runtime = webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"));
    if (!runtime) throw new Error("Dashboard runtime missing");
    return runtime.executeJavaScript("window.dashboardApi.readVaultIndex().then(() => 'unexpected', () => 'denied')");
  });
  expect(revoked).toBe("denied");

  await page.getByRole("button", { name: "Stop dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard stopped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect.poll(() => guestPresent(app)).toBe(false);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => guestPresent(app)).toBe(true);

  const oldRuntimeId = await app.evaluate(
    ({ webContents }) =>
      webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"))?.id ?? null,
  );
  fs.appendFileSync(
    path.join(vaultDir, ".data-vault", "dashboards", dashboard.id, "app.js"),
    "\n// trigger trusted vault refresh\n",
  );
  await expect
    .poll(
      () =>
        app.evaluate(
          ({ webContents }) =>
            webContents.getAllWebContents().find((item) => item.getURL().startsWith("vault-dashboard://"))?.id ?? null,
        ),
      { timeout: 10_000 },
    )
    .not.toBe(oldRuntimeId);
});
