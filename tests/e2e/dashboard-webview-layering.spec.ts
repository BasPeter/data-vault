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
  await expect
    .poll(() =>
      page.evaluate((selector) => {
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
        const x = left + (right - left) / 2;
        const y = top + (bottom - top) / 2;
        const painted = document.elementFromPoint(x, y);
        const trustedPaint =
          painted !== null &&
          (overlay.contains(painted) || painted.closest<HTMLElement>('[data-slot$="-overlay"]') !== null);
        return {
          overlap: true,
          trustedOwnsOverlapPoint: trustedPaint,
          webviewDisplay: getComputedStyle(webview).display,
        };
      }, overlaySelector),
    )
    .toEqual({
      overlap: true,
      trustedOwnsOverlapPoint: true,
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

test("trusted flows isolate retained and destructively remounted guests", async ({ appLaunch }) => {
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

  await page.evaluate(() => {
    window.prompt = () => {
      const webview = document.querySelector<HTMLElement>('[data-testid="dashboard-webview"]')!;
      (
        window as typeof window & {
          __promptIsolationProof?: {
            display: string;
            offsetParent: boolean;
            guestFocused: boolean;
          };
        }
      ).__promptIsolationProof = {
        display: getComputedStyle(webview).display,
        offsetParent: webview.offsetParent !== null,
        guestFocused: document.activeElement === webview,
      };
      return null;
    };
  });
  await page.getByRole("button", { name: "Consent hide dashboard menu" }).click();
  await app.evaluate(({ BrowserWindow, webContents }) => {
    const owner = BrowserWindow.getAllWindows()[0];
    if (!owner) throw new Error("Dashboard host window not found.");
    const originalGetFocused = webContents.getFocusedWebContents.bind(webContents);
    webContents.getFocusedWebContents = () => {
      webContents.getFocusedWebContents = originalGetFocused;
      return owner.webContents;
    };
  });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __promptIsolationProof?: {
                display: string;
                offsetParent: boolean;
                guestFocused: boolean;
              };
            }
          ).__promptIsolationProof,
      ),
    )
    .toEqual({ display: "none", offsetParent: false, guestFocused: false });
  await expect(page.getByTestId("dashboard-webview")).not.toHaveCSS("display", "none");
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({ runtimeId: before.runtimeId, status: "ready", attached: true }),
  );
  expect(
    await app.evaluate(async ({ webContents }, webContentsId) => {
      const contents = webContents.fromId(webContentsId);
      return contents?.executeJavaScript("globalThis.__consentProbe.marker");
    }, beforeGuestId),
  ).toBe("still-alive");

  await page.getByTestId("dashboard-webview").focus();
  await app.evaluate(({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    contents.focus();
  }, beforeGuestId);
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => {
        const focused = webContents.getFocusedWebContents();
        return { id: focused?.id, type: focused?.getType() };
      }),
    )
    .toEqual({ id: beforeGuestId, type: "webview" });
  await page.getByRole("button", { name: "Manage access" }).evaluate((button) => button.click());
  const dialog = page.getByRole("dialog", { name: "Manage dashboard access" });
  await expect(dialog).toBeVisible();

  // Privileged UI may appear only after the destroyed guest has already been
  // replaced by one different, attached, ready runtime. The replacement mounts
  // hidden, so it contributes neither pixels nor an input target.
  const replacement = await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus());
  expect(replacement).toEqual(expect.objectContaining({ status: "ready", attached: true }));
  expect(replacement?.runtimeId).not.toBe(before.runtimeId);
  expect(await guestCount(app)).toBe(1);
  const replacementGuestId = await guestIdForRuntime(app, replacement!.runtimeId);
  expect(replacementGuestId).not.toBe(beforeGuestId);
  await expect(page.getByTestId("dashboard-webview")).toHaveCSS("display", "none");

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
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x + 1, y + 1)?.tagName, {
      x: dashboardBox!.x,
      y: dashboardBox!.y,
    }),
  ).not.toBe("WEBVIEW");
  expect(
    await app.evaluate(async ({ webContents }, webContentsId) => {
      const contents = webContents.fromId(webContentsId);
      return {
        title: await contents?.executeJavaScript("document.title"),
        markerType: await contents?.executeJavaScript("typeof globalThis.__consentProbe"),
      };
    }, replacementGuestId),
  ).toEqual({ title: "layer", markerType: "undefined" });

  // Cancel only unhides the already-ready replacement. It must not schedule a
  // second remount, and an immediate second Manage action must be usable.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("dashboard-webview")).not.toHaveCSS("display", "none");
  const afterCancel = await readyStatus(page);
  expect(afterCancel.runtimeId).toBe(replacement!.runtimeId);
  expect(await guestIdForRuntime(app, afterCancel.runtimeId)).toBe(replacementGuestId);
  expect(await guestCount(app)).toBe(1);

  await page.getByRole("button", { name: "Manage access" }).evaluate((button) => button.click());
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/controls what .*Consent hide.* can read/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("dashboard-host")).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("WEBVIEW");
});

test("trusted flow fails closed when main cannot acknowledge focus transfer", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  await createBlankDashboard(page, vaultDir, "Rejected consent");
  await page.reload();
  await page.getByRole("button", { name: "Open Rejected consent dashboard" }).click();
  await readyStatus(page);

  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("dashboard-runtime:prepare-trusted-flow");
    ipcMain.handle("dashboard-runtime:prepare-trusted-flow", () => {
      throw new Error("Rejected for trusted-flow test.");
    });
  });

  await page.getByRole("button", { name: "Manage access" }).evaluate((button) => button.click());
  await expect(page.getByRole("dialog", { name: "Manage dashboard access" })).toBeHidden();
  await expect(page.getByRole("alert")).toContainText("Dashboard trusted flow is unavailable.");
  await expect(page.getByTestId("dashboard-webview")).toHaveCSS("display", "none");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("WEBVIEW");
});
