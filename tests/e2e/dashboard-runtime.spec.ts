import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./electron-app";
import type { Page } from "@playwright/test";

const vaultId = "00000000-0000-4000-8000-000000000001";
const here = path.dirname(fileURLToPath(import.meta.url));
const hostileFixture = path.resolve(here, "..", "fixtures", "dashboards", "hostile");

/**
 * Mirror `DashboardHost`: open the runtime and mount a `<webview>` for it with
 * the host-derived partition and src. The guest attaches through the hardened
 * `will-attach-webview`/`did-attach-webview` hooks, which force the sandboxed
 * preload and preferences — nothing here can widen them.
 */
async function mountDashboardWebview(page: Page, dashboardId: string): Promise<void> {
  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      document.querySelector("webview")?.remove();
      const descriptor = await window.vaultApi.openDashboard(vaultId, dashboardId);
      const webview = document.createElement("webview");
      webview.setAttribute("partition", descriptor.partition);
      webview.setAttribute("src", descriptor.src);
      webview.setAttribute("data-testid", "dashboard-webview");
      webview.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      document.body.append(webview);
    },
    { vaultId, dashboardId },
  );
}

// `ready` is set on the guest's `did-finish-load`, so it guarantees the guest
// has attached and loaded — unlike a non-null status, which `prepare()` sets to
// `loading` before any guest exists.
async function waitForDashboardReady(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus()))
    .toEqual(expect.objectContaining({ status: "ready", attached: true }));
}

type RuntimeTestingStatus = {
  runtimeId: string;
  status: "loading" | "ready" | "failed" | "unresponsive" | "stopped";
  attached: boolean;
};

async function runtimeStatus(page: Page): Promise<RuntimeTestingStatus> {
  const status = (await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())) as RuntimeTestingStatus | null;
  if (!status) throw new Error("Dashboard runtime status is unavailable.");
  return status;
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

test("contains a hostile fixture inside one bounded disposable runtime", async ({ appLaunch }) => {
  const { app, page, vaultDir } = appLaunch;
  await page.evaluate(() => {
    document.documentElement.dataset.hostSecret = "trusted-application-dom";
    localStorage.setItem("host-secret", "trusted-application-storage");
    window.name = "trusted-application-window";
  });
  const hostOrigin = await page.evaluate(() => location.origin);
  const dashboard = await page.evaluate(
    async (id) =>
      window.vaultApi.createDashboard(id, {
        title: "Hostile boundary probe",
        icon: "lightbulb",
        color: "orange",
        kind: "blank",
        location: "vault",
      }),
    vaultId,
  );
  const bundle = path.join(vaultDir, ".data-vault", "dashboards", dashboard.id);
  fs.copyFileSync(path.join(hostileFixture, "index.html"), path.join(bundle, "index.html"));
  fs.copyFileSync(path.join(hostileFixture, "probe.js"), path.join(bundle, "probe.js"));
  fs.writeFileSync(path.join(bundle, "worker.js"), 'postMessage("worker-ran");\n');
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);

  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  // The guest is a distinct web contents attached through the hooks, not a
  // DOM descendant of the app page. Its forced preferences are the load-bearing
  // isolation guarantee that replaces the old "native view off trusted chrome".
  const attachedStatus = await runtimeStatus(page);
  const attachedGuestId = await guestIdForRuntime(app, attachedStatus.runtimeId);
  const guest = await app.evaluate(({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    return {
      count: webContents.getAllWebContents().filter((c) => c.getURL().startsWith("vault-dashboard://")).length,
      id: contents.id,
      url: contents.getURL(),
      loading: contents.isLoadingMainFrame(),
      preferences: contents.getLastWebPreferences(),
      sessionStoragePath: contents.session.storagePath,
    };
  }, attachedGuestId);
  const dashboardUrl = guest.url;
  expect(guest.count).toBe(1);
  expect(guest.id).toBe(attachedGuestId);
  expect(new URL(guest.url).hostname).toBe(attachedStatus.runtimeId);
  expect(guest.loading).toBe(false);
  expect(guest.preferences).toEqual(
    expect.objectContaining({
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    }),
  );
  expect(guest.sessionStoragePath).toBeNull();
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({
      status: "ready",
      attached: true,
      runtimeId: attachedStatus.runtimeId,
    }),
  );

  const probes = await app.evaluate(
    async ({ webContents }, { expectedHostOrigin, webContentsId }) => {
      const contents = webContents.fromId(webContentsId);
      if (!contents) throw new Error("Dashboard web contents not found.");
      return contents.executeJavaScript(`(async () => {
      const attempt = async (work) => { try { await work(); return "unexpected"; } catch { return "blocked"; } };
      const iframe = document.createElement("iframe");
      iframe.src = "https://example.com/";
      document.body.append(iframe);
      const form = document.createElement("form");
      form.action = "https://example.com/";
      form.method = "post";
      document.body.append(form);
      try { form.submit(); } catch {}
      const worker = await new Promise((resolve) => {
        try {
          const instance = new Worker("worker.js");
          let settled = false;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            instance.terminate();
            resolve(result);
          };
          instance.onmessage = () => finish("unexpected");
          instance.onerror = () => finish("blocked");
          setTimeout(() => finish("blocked"), 100);
        } catch { resolve("blocked"); }
      });
      const serviceWorker = navigator.serviceWorker
        ? await attempt(() => navigator.serviceWorker.register("probe.js"))
        : "unavailable";
      const permission = await navigator.permissions.query({ name: "notifications" }).then((value) => value.state);
      const clipboard = navigator.clipboard
        ? await attempt(() => navigator.clipboard.readText())
        : "unavailable";
      const media = navigator.mediaDevices
        ? await attempt(() => navigator.mediaDevices.getUserMedia({ audio: true }))
        : "unavailable";
      const popup = window.open("https://example.com/");
      location.replace("https://example.com/redirected");
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        node: typeof process,
        require: typeof require,
        electron: typeof electron,
        rawIpc: typeof window.ipcRenderer,
        vaultApi: typeof window.vaultApi,
        dashboardApiKeys: Object.keys(window.dashboardApi).sort(),
        dashboardApiFrozen: Object.isFrozen(window.dashboardApi),
        applicationDom: document.documentElement.dataset.hostSecret ?? null,
        applicationStorage: localStorage.getItem("host-secret"),
        applicationCookie: document.cookie,
        applicationWindowName: window.name,
        isolatedTop: top === self && parent === self && opener === null,
        origin: location.origin,
        hostOrigin: ${JSON.stringify(expectedHostOrigin)},
        network: await attempt(() => fetch("https://example.com/")),
        file: await attempt(() => fetch("file:///secret")),
        worker,
        serviceWorker,
        permission,
        clipboard,
        media,
        popup: popup === null,
        frameCount: document.querySelectorAll("iframe").length,
        url: location.href,
        fixtureProbe: globalThis.__boundaryProbeVersion,
      };
    })()`);
    },
    { expectedHostOrigin: hostOrigin, webContentsId: attachedGuestId },
  );
  expect(probes).toEqual(
    expect.objectContaining({
      node: "undefined",
      require: "undefined",
      electron: "undefined",
      rawIpc: "undefined",
      vaultApi: "undefined",
      // Pins the exact exposed surface: a new method must be a deliberate change.
      dashboardApiKeys: [
        "getInfo",
        "listSecrets",
        "openExternalLink",
        "readDocuments",
        "readState",
        "readVaultIndex",
        "secureFetch",
        "writeState",
      ],
      dashboardApiFrozen: true,
      applicationDom: null,
      applicationStorage: null,
      applicationCookie: "",
      applicationWindowName: "",
      isolatedTop: true,
      network: "blocked",
      file: "blocked",
      worker: "blocked",
      permission: "denied",
      popup: true,
      frameCount: 1,
      fixtureProbe: "fixture-original",
    }),
  );
  expect(probes.origin).not.toBe(probes.hostOrigin);
  expect(probes.serviceWorker).not.toBe("unexpected");
  expect(probes.clipboard).not.toBe("unexpected");
  expect(probes.media).not.toBe("unexpected");
  expect(probes.url).toMatch(/^vault-dashboard:\/\//);
  expect(
    await app.evaluate(
      ({ webContents }, webContentsId) => webContents.fromId(webContentsId)?.mainFrame.frames.length,
      attachedGuestId,
    ),
  ).toBe(1);

  const preloadLimits = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    return contents.executeJavaScript(`(async () => {
      const rejected = async (operation) => {
        try { await operation(); return "unexpected"; }
        catch (error) { return String(error?.message ?? error); }
      };
      let deep = null;
      for (let index = 0; index < 70; index += 1) deep = { child: deep };
      return {
        oversizedString: await rejected(() => window.dashboardApi.writeState("x".repeat(1024 * 1024 + 1))),
        oversizedObject: await rejected(() => window.dashboardApi.writeState(deep)),
        oversizedArray: await rejected(() => window.dashboardApi.writeState(new Array(100001).fill(null))),
        excessIds: await rejected(() => window.dashboardApi.readDocuments(new Array(21).fill("document.html"))),
        oversizedId: await rejected(() => window.dashboardApi.readDocuments(["x".repeat(513)])),
        responsive: (await window.dashboardApi.getInfo()).id,
      };
    })()`);
  }, attachedGuestId);
  expect(preloadLimits).toEqual({
    oversizedString: "Invalid dashboard API request.",
    oversizedObject: "Invalid dashboard API request.",
    oversizedArray: "Invalid dashboard API request.",
    excessIds: "Invalid dashboard API request.",
    oversizedId: "Invalid dashboard API request.",
    responsive: dashboard.id,
  });

  const download = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    return new Promise<{ seen: boolean; prevented: boolean }>((resolve) => {
      let settled = false;
      const observed = (event: Electron.Event): void => {
        settled = true;
        resolve({ seen: true, prevented: event.defaultPrevented });
      };
      contents.session.once("will-download", observed);
      void contents.executeJavaScript(`(() => {
        const link = document.createElement("a");
        link.download = "blocked.txt";
        link.href = "data:text/plain,blocked";
        document.body.append(link);
        link.click();
      })()`);
      setTimeout(() => {
        if (!settled) {
          contents.session.off("will-download", observed);
          resolve({ seen: false, prevented: true });
        }
      }, 250);
    });
  }, attachedGuestId);
  expect(download.prevented).toBe(true);

  // An active runtime serves the immutable snapshot bytes even after the source
  // file changes on disk; only a reload re-reads and re-digests the bundle.
  const probeFile = path.join(bundle, "probe.js");
  fs.writeFileSync(probeFile, 'globalThis.__boundaryProbeVersion = "mutated";\n');
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  const sameRuntimeBytes = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    return contents.executeJavaScript(`new Promise((resolve, reject) => {
      globalThis.__boundaryProbeVersion = "cleared";
      const script = document.createElement("script");
      script.src = "probe%2Ejs";
      script.onload = () => resolve(globalThis.__boundaryProbeVersion);
      script.onerror = reject;
      document.head.append(script);
    })`);
  }, attachedGuestId);
  expect(sameRuntimeBytes).toBe("fixture-original");

  const oldOrigin = dashboardUrl.replace(/\/[^/]*$/, "");
  const second = await page.evaluate(
    async (id) =>
      window.vaultApi.createDashboard(id, {
        title: "Second runtime",
        icon: "target",
        color: "blue",
        kind: "blank",
        location: "vault",
      }),
    vaultId,
  );
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  await mountDashboardWebview(page, second.id);
  await waitForDashboardReady(page);
  const secondStatus = await runtimeStatus(page);
  const secondGuestId = await guestIdForRuntime(app, secondStatus.runtimeId);
  expect(secondGuestId).not.toBe(attachedGuestId);
  expect(
    await app.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().filter((contents) => contents.getURL().startsWith("vault-dashboard://")).length,
    ),
  ).toBe(1);
  const crossRuntime = await app.evaluate(
    async ({ webContents }, { previousOrigin, webContentsId }) => {
      const contents = webContents.fromId(webContentsId);
      if (!contents) throw new Error("Dashboard web contents not found.");
      const blocked = await contents.executeJavaScript(`new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(false);
      image.onerror = () => resolve(true);
      image.src = ${JSON.stringify(`${previousOrigin}/index.html`)};
    })`);
      return { currentOrigin: contents.getURL().replace(/\/[^/]*$/, ""), blocked };
    },
    { previousOrigin: oldOrigin, webContentsId: secondGuestId },
  );
  expect(crossRuntime).toEqual({ currentOrigin: expect.not.stringContaining(oldOrigin), blocked: true });

  // Reopening the mutated first dashboard re-reads the snapshot, so the changed
  // bytes now execute (after reload, digest and grants are re-evaluated).
  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  const reopenedStatus = await runtimeStatus(page);
  const reopenedGuestId = await guestIdForRuntime(app, reopenedStatus.runtimeId);
  const reopenedBytes = await app.evaluate(async ({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    return contents?.executeJavaScript("globalThis.__boundaryProbeVersion");
  }, reopenedGuestId);
  expect(reopenedBytes).toBe("mutated");

  await page.evaluate(() => {
    document.querySelector("webview")?.remove();
    return window.vaultApi.stopDashboard();
  });
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);
});

test("contains unresponsive, crash, reload, and stop lifecycle events", async ({ appLaunch }) => {
  const { app, page } = appLaunch;
  const dashboard = await page.evaluate(
    async (id) =>
      window.vaultApi.createDashboard(id, {
        title: "Lifecycle probe",
        icon: "target",
        color: "slate",
        kind: "blank",
        location: "vault",
      }),
    vaultId,
  );
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);

  // Preparing a runtime and immediately stopping it must resolve cleanly without
  // leaking a destroyed-object error, even though no guest ever attaches.
  const interruptedPrepare = await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      const opening = window.vaultApi.openDashboard(vaultId, dashboardId);
      await window.vaultApi.stopDashboard();
      return opening.then(
        () => "resolved",
        (error) => String(error),
      );
    },
    { vaultId, dashboardId: dashboard.id },
  );
  expect(interruptedPrepare).toBe("resolved");

  const concurrentSwitch = await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      const first = window.vaultApi.openDashboard(vaultId, dashboardId);
      const second = window.vaultApi.openDashboard(vaultId, dashboardId);
      return Promise.allSettled([first, second]).then((results) => results.map((result) => result.status));
    },
    { vaultId, dashboardId: dashboard.id },
  );
  expect(concurrentSwitch).toEqual(["fulfilled", "fulfilled"]);
  await page.evaluate(() => window.vaultApi.stopDashboard());

  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  const firstLifecycleStatus = await runtimeStatus(page);
  const firstLifecycleGuestId = await guestIdForRuntime(app, firstLifecycleStatus.runtimeId);

  // Destroying the guest from main tears the runtime down and clears authority
  // without leaking Electron's native destroyed-object error to trusted callers.
  await app.evaluate(({ webContents }, webContentsId) => {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error("Dashboard web contents not found.");
    contents.close({ waitForBeforeUnload: false });
  }, firstLifecycleGuestId);
  await expect.poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toBeNull();
  await expect.poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeAuthorityCountForTesting())).toBe(0);
  const staleError = await page.evaluate(
    ({ vaultId, dashboardId }) =>
      window.vaultApi.dashboardPermissionDetails(vaultId, dashboardId).then(
        () => "unexpected",
        (error) => String(error),
      ),
    { vaultId, dashboardId: dashboard.id },
  );
  expect(staleError).toContain("Dashboard runtime is unavailable");
  expect(staleError).not.toContain("Object has been destroyed");

  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  const responsiveStatus = await runtimeStatus(page);
  const responsiveGuestId = await guestIdForRuntime(app, responsiveStatus.runtimeId);

  // Unresponsive exposes a host-visible status without detaching or prompting
  // from dashboard pixels; responsive clears it back to ready.
  await app.evaluate(({ webContents }, webContentsId) => {
    webContents.fromId(webContentsId)?.emit("unresponsive");
  }, responsiveGuestId);
  await expect
    .poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus()))
    .toEqual(expect.objectContaining({ status: "unresponsive" }));
  await app.evaluate(({ webContents }, webContentsId) => {
    webContents.fromId(webContentsId)?.emit("responsive");
  }, responsiveGuestId);
  await expect
    .poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus()))
    .toEqual(expect.objectContaining({ status: "ready", attached: true }));

  await app.evaluate(({ webContents }, webContentsId) => {
    webContents.fromId(webContentsId)?.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  }, responsiveGuestId);
  await expect.poll(() => page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toBeNull();
  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  await page.reload();
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);

  await page.waitForFunction(() => typeof window.vaultApi?.openDashboard === "function");
  await mountDashboardWebview(page, dashboard.id);
  await waitForDashboardReady(page);
  await page.evaluate(() => {
    document.querySelector("webview")?.remove();
    return window.vaultApi.stopDashboard();
  });
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);

  const stderr: string[] = [];
  app.process().stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  const pendingWindowClose = page
    .evaluate(({ vaultId, dashboardId }) => window.vaultApi.openDashboard(vaultId, dashboardId), {
      vaultId,
      dashboardId: dashboard.id,
    })
    .catch((error) => String(error));
  const applicationClosed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await applicationClosed;
  await pendingWindowClose;
  expect(stderr.join("\n")).not.toContain("Object has been destroyed");
});
