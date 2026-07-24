import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./electron-app";
import type { Page } from "@playwright/test";

const vaultId = "00000000-0000-4000-8000-000000000001";

async function createBlankDashboard(page: Page, vaultDir: string, title: string): Promise<string> {
  const dashboard = await page.evaluate(
    async ({ vaultId, title }) =>
      window.vaultApi.createDashboard(vaultId, {
        title,
        icon: "target",
        color: "blue",
        kind: "blank",
        location: "vault",
      }),
    { vaultId, title },
  );
  const bundle = path.join(vaultDir, ".data-vault", "dashboards", dashboard.id);
  fs.writeFileSync(
    path.join(bundle, "index.html"),
    "<!doctype html><meta charset=utf-8><title>layer</title><h1>dashboard</h1>\n",
  );
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  return dashboard.id;
}

async function guestCount(app: import("@playwright/test").ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ webContents }) =>
      webContents.getAllWebContents().filter((contents) => contents.getURL().startsWith("vault-dashboard://")).length,
  );
}

type RuntimeTestingStatus = {
  runtimeId: string;
  status: string;
  attached: boolean;
};

async function readyStatus(page: Page): Promise<RuntimeTestingStatus> {
  await expect
    .poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus()))
    .toEqual(expect.objectContaining({ status: "ready", attached: true }));
  return (await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())) as RuntimeTestingStatus;
}

async function guestIdForRuntime(
  app: import("@playwright/test").ElectronApplication,
  runtimeId: string,
): Promise<number> {
  return app.evaluate(({ webContents }, mappedRuntimeId) => {
    const guest = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith(`vault-dashboard://${mappedRuntimeId}/`));
    if (!guest) throw new Error("Mapped dashboard guest not found.");
    return guest.id;
  }, runtimeId);
}

async function expectOverlayAboveDashboard(page: Page, overlaySelector: string): Promise<void> {
  const proof = await page.evaluate((selector) => {
    const webview = document.querySelector<HTMLElement>("[data-testid=dashboard-webview]");
    const overlay = [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(candidate).visibility !== "hidden";
    });
    if (!webview || !overlay) return null;
    const guest = webview.getBoundingClientRect();
    const trusted = overlay.getBoundingClientRect();
    const left = Math.max(guest.left, trusted.left);
    const right = Math.min(guest.right, trusted.right);
    const top = Math.max(guest.top, trusted.top);
    const bottom = Math.min(guest.bottom, trusted.bottom);
    if (left >= right || top >= bottom) return { overlap: false };
    const zIndex = (element: HTMLElement) => {
      const value = Number.parseInt(getComputedStyle(element).zIndex, 10);
      return Number.isFinite(value) ? value : 0;
    };
    return {
      overlap: true,
      overlayIsAboveByZIndex: zIndex(overlay) > zIndex(webview),
      webviewDisplay: getComputedStyle(webview).display,
    };
  }, overlaySelector);
  expect(proof).toEqual({
    overlap: true,
    overlayIsAboveByZIndex: true,
    webviewDisplay: expect.not.stringMatching(/^none$/),
  });
}

test("forces the sandbox profile on the guest and denies an unauthorized attach", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  const dashboardId = await createBlankDashboard(page, vaultDir, "Attach hardening");

  // Mount the legitimate guest but try to widen it with a rogue `nodeintegration`
  // attribute. Main forces the sandbox profile at `will-attach-webview`, so the
  // attribute cannot take effect.
  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      const descriptor = await window.vaultApi.openDashboard(vaultId, dashboardId);
      const webview = document.createElement("webview");
      webview.setAttribute("partition", descriptor.partition);
      webview.setAttribute("src", descriptor.src);
      webview.setAttribute("nodeintegration", "on");
      webview.setAttribute("data-testid", "dashboard-webview");
      webview.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      document.body.append(webview);
    },
    { vaultId, dashboardId },
  );
  const status = await readyStatus(page);
  const guestId = await guestIdForRuntime(app, status.runtimeId);

  const forced = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    const preferences = contents.getLastWebPreferences();
    return {
      id: contents.id,
      nodeIntegration: preferences?.nodeIntegration,
      nodeIntegrationInSubFrames: preferences?.nodeIntegrationInSubFrames,
      contextIsolation: preferences?.contextIsolation,
      sandbox: preferences?.sandbox,
      dashboardApi: await contents.executeJavaScript("typeof window.dashboardApi"),
      storagePath: contents.session.storagePath,
      node: await contents.executeJavaScript("typeof process"),
    };
  }, guestId);
  expect(forced).toEqual(
    expect.objectContaining({
      id: guestId,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      dashboardApi: "object",
      storagePath: null,
      node: "undefined",
    }),
  );

  // Escalated preferences are overwritten for the authorized identity. An
  // incorrect partition or src is different: identity mismatch is denied.
  await page.evaluate(() => {
    document.querySelector("webview")?.remove();
    return window.vaultApi.stopDashboard();
  });
  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      const descriptor = await window.vaultApi.openDashboard(vaultId, dashboardId);
      const rogue = document.createElement("webview");
      rogue.setAttribute("partition", "dashboard-forged");
      rogue.setAttribute("src", descriptor.src);
      rogue.setAttribute("data-testid", "rogue-webview");
      rogue.style.cssText = "position:absolute;inset:0;";
      document.body.append(rogue);
    },
    { vaultId, dashboardId },
  );
  await expect.poll(() => guestCount(app)).toBe(0);
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({ status: "loading", attached: false }),
  );

  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      document.querySelector("webview")?.remove();
      await window.vaultApi.stopDashboard();
      const descriptor = await window.vaultApi.openDashboard(vaultId, dashboardId);
      const rogue = document.createElement("webview");
      rogue.setAttribute("partition", descriptor.partition);
      rogue.setAttribute("src", "vault-dashboard://forged/index.html");
      rogue.setAttribute("data-testid", "rogue-webview");
      document.body.append(rogue);
    },
    { vaultId, dashboardId },
  );
  await expect.poll(() => guestCount(app)).toBe(0);
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({ status: "loading", attached: false }),
  );
});

test("git status, quick notes, and a dialog visibly layer over one live dashboard guest", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  await createBlankDashboard(page, vaultDir, "Overlay layering");
  await page.reload();
  await page.getByRole("button", { name: "Open Overlay layering dashboard" }).click();
  const runtime = await readyStatus(page);
  const runtimeGuestId = await guestIdForRuntime(app, runtime.runtimeId);

  const assertRuntimeSurvives = async () => {
    expect(await readyStatus(page)).toEqual(runtime);
    expect(await guestCount(app)).toBe(1);
    expect(
      await app.evaluate(
        ({ webContents }, webContentsId) => webContents.fromId(webContentsId)?.isDestroyed(),
        runtimeGuestId,
      ),
    ).toBe(false);
  };

  await page.getByRole("button", { name: /uncommitted change|No uncommitted changes|check vault changes/ }).click();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
  await expectOverlayAboveDashboard(page, '[data-slot="popover-content"]');
  await assertRuntimeSurvives();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Quick notes" }).click();
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
  await expectOverlayAboveDashboard(page, '[data-slot="sheet-content"]');
  await assertRuntimeSurvives();
  await page.getByRole("button", { name: "Close quick notes" }).click();

  await page.getByTestId("vault-switcher").click();
  await page.getByRole("button", { name: "Create empty vault…" }).evaluate((button) => button.click());
  const dialog = page.getByRole("dialog", { name: "Create empty vault" });
  await expect(dialog).toBeVisible();
  await expectOverlayAboveDashboard(page, '[role="dialog"]');
  await assertRuntimeSurvives();
  await page.keyboard.press("Escape");
});

test("real Manage access blocks guest focus and input while preserving the runtime", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  await createBlankDashboard(page, vaultDir, "Consent hide");
  await page.reload();
  await page.getByRole("button", { name: "Open Consent hide dashboard" }).click();
  const before = await readyStatus(page);
  const beforeGuestId = await guestIdForRuntime(app, before.runtimeId);
  const dashboardBox = await page.getByTestId("dashboard-webview").boundingBox();
  expect(dashboardBox).not.toBeNull();

  await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    await contents.executeJavaScript(`(() => {
      globalThis.__consentProbe = { focus: 0, key: 0, pointer: 0, marker: "still-alive" };
      addEventListener("focus", () => { globalThis.__consentProbe.focus += 1; });
      addEventListener("keydown", () => { globalThis.__consentProbe.key += 1; });
      addEventListener("pointerdown", () => { globalThis.__consentProbe.pointer += 1; });
    })()`);
  }, beforeGuestId);

  await page.getByRole("button", { name: "Manage access" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage dashboard access" });
  await expect(dialog).toBeVisible();

  const hidden = await page.evaluate(() => {
    const webview = document.querySelector<HTMLElement>('[data-testid="dashboard-webview"]')!;
    return {
      display: getComputedStyle(webview).display,
      offsetParent: webview.offsetParent,
      guestFocused: document.activeElement === webview,
      trustedFocused: document.activeElement?.closest('[role="dialog"]') !== null,
    };
  });
  expect(hidden).toEqual({ display: "none", offsetParent: null, guestFocused: false, trustedFocused: true });

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  await page.mouse.click(dialogBox!.x + dialogBox!.width / 2, dialogBox!.y + dialogBox!.height / 2);
  await page.keyboard.press("x");
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="dashboard-webview"]')!.focus());
  expect(
    await app.evaluate(async ({ webContents }, webContentsId) => {
      const contents = webContents.fromId(webContentsId);
      return contents?.executeJavaScript("globalThis.__consentProbe");
    }, beforeGuestId),
  ).toEqual({ focus: 0, key: 0, pointer: 0, marker: "still-alive" });
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x + 1, y + 1)?.tagName, {
      x: dashboardBox!.x,
      y: dashboardBox!.y,
    }),
  ).not.toBe("WEBVIEW");

  // Leave the trusted flow: restore visibility. Same runtime, still responsive —
  // no reload, no lost in-memory state.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.querySelector<HTMLElement>('[data-testid="dashboard-webview"]')!).display,
      ),
    )
    .not.toBe("none");
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({
      status: "ready",
      attached: true,
      runtimeId: before.runtimeId,
    }),
  );
  expect(await guestCount(app)).toBe(1);
  const stillResponsive = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    return {
      title: await contents?.executeJavaScript("document.title"),
      marker: await contents?.executeJavaScript("globalThis.__consentProbe.marker"),
    };
  }, beforeGuestId);
  expect(stillResponsive).toEqual({ title: "layer", marker: "still-alive" });
});
