import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./electron-app";

const vaultId = "00000000-0000-4000-8000-000000000001";
const here = path.dirname(fileURLToPath(import.meta.url));
const hostileFixture = path.resolve(here, "..", "fixtures", "dashboards", "hostile");

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
      }),
    vaultId,
  );
  const bundle = path.join(vaultDir, ".data-vault", "dashboards", dashboard.id);
  fs.copyFileSync(path.join(hostileFixture, "index.html"), path.join(bundle, "index.html"));
  fs.copyFileSync(path.join(hostileFixture, "probe.js"), path.join(bundle, "probe.js"));
  fs.writeFileSync(path.join(bundle, "worker.js"), 'postMessage("worker-ran");\n');
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);

  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      await window.vaultApi.openDashboard(vaultId, dashboardId);
      await window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 });
    },
    { vaultId, dashboardId: dashboard.id },
  );

  const native = await app.evaluate(({ BrowserWindow, WebContentsView, webContents }) => {
    const host = BrowserWindow.getAllWindows()[0];
    const child = host.contentView.children.find(
      (view): view is Electron.WebContentsView => view instanceof WebContentsView,
    );
    const dashboardContents = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("vault-dashboard://"));
    return {
      childCount: host.contentView.children.length,
      bounds: child?.getBounds() ?? null,
      hostZoomFactor: host.webContents.getZoomFactor(),
      hostZoomLevel: host.webContents.getZoomLevel(),
      dashboardId: dashboardContents?.id,
      dashboardUrl: dashboardContents?.getURL(),
      preferences: dashboardContents?.getLastWebPreferences(),
    };
  });
  expect(native.childCount).toBe(1);
  expect(native.bounds).toEqual(expect.objectContaining({ x: 512, y: 56 }));
  expect(native.bounds!.width).toBeGreaterThan(0);
  expect(native.bounds!.height).toBeGreaterThan(0);
  expect(native.hostZoomFactor).toBe(1);
  expect(native.hostZoomLevel).toBe(0);
  expect(native.preferences).toEqual(
    expect.objectContaining({ nodeIntegration: false, contextIsolation: true, sandbox: true }),
  );

  await page.evaluate(async () => {
    await window.vaultApi.setDashboardContentBounds({ x: 280, y: 56, width: 1000, height: 764 });
    await window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 });
  });
  const responsiveBounds = await app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const host = BrowserWindow.getAllWindows()[0];
    return host.contentView.children.find((view) => view instanceof WebContentsView)?.getBounds() ?? null;
  });
  expect(responsiveBounds).toEqual({ x: 280, y: 56, width: 1000, height: 764 });

  const probes = await app.evaluate(async ({ webContents }, expectedHostOrigin) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
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
  }, hostOrigin);
  expect(probes).toEqual(
    expect.objectContaining({
      node: "undefined",
      require: "undefined",
      electron: "undefined",
      rawIpc: "undefined",
      vaultApi: "undefined",
      dashboardApiKeys: ["getInfo", "readDocuments", "readState", "readVaultIndex", "writeState"],
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
      ({ webContents }) =>
        webContents.getAllWebContents().find((contents) => contents.getURL().startsWith("vault-dashboard://"))
          ?.mainFrame.frames.length,
    ),
  ).toBe(1);

  const preloadLimits = await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
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
  });
  expect(preloadLimits).toEqual({
    oversizedString: "Invalid dashboard API request.",
    oversizedObject: "Invalid dashboard API request.",
    oversizedArray: "Invalid dashboard API request.",
    excessIds: "Invalid dashboard API request.",
    oversizedId: "Invalid dashboard API request.",
    responsive: dashboard.id,
  });

  const download = await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
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
  });
  expect(download.prevented).toBe(true);

  await page.evaluate(() => window.vaultApi.setDashboardBounds({ x: 200_000, y: 200_000, width: 10, height: 10 }));
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length))
    .toBe(0);
  await page.evaluate(() => window.vaultApi.setDashboardBounds({ x: Number.NaN, y: 0, width: 100, height: 100 }));
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length))
    .toBe(0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600));
  await page.evaluate(() => window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 }));
  const resizedBounds = await app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const host = BrowserWindow.getAllWindows()[0];
    return host.contentView.children.find((view) => view instanceof WebContentsView)?.getBounds() ?? null;
  });
  expect(resizedBounds).toEqual({ x: 280, y: 56, width: 620, height: 544 });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
  await page.evaluate(() => window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 900, height: 600 }));
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(
    1,
  );

  const probeFile = path.join(bundle, "probe.js");
  fs.writeFileSync(probeFile, 'globalThis.__boundaryProbeVersion = "mutated";\n');
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  const sameRuntimeBytes = await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
    if (!contents) throw new Error("Dashboard web contents not found.");
    return contents.executeJavaScript(`new Promise((resolve, reject) => {
      globalThis.__boundaryProbeVersion = "cleared";
      const script = document.createElement("script");
      script.src = "probe%2Ejs";
      script.onload = () => resolve(globalThis.__boundaryProbeVersion);
      script.onerror = reject;
      document.head.append(script);
    })`);
  });
  expect(sameRuntimeBytes).toBe("fixture-original");

  const oldOrigin = native.dashboardUrl?.replace(/\/[^/]*$/, "") ?? "";
  const second = await page.evaluate(
    async (id) =>
      window.vaultApi.createDashboard(id, {
        title: "Second runtime",
        icon: "target",
        color: "blue",
        kind: "blank",
      }),
    vaultId,
  );
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      await window.vaultApi.openDashboard(vaultId, dashboardId);
      await window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 900, height: 600 });
    },
    { vaultId, dashboardId: second.id },
  );
  const crossRuntime = await app.evaluate(async ({ webContents }, previousOrigin) => {
    const dashboards = webContents
      .getAllWebContents()
      .filter((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
    const blocked = await dashboards[0]?.executeJavaScript(`new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(false);
      image.onerror = () => resolve(true);
      image.src = ${JSON.stringify(`${previousOrigin}/index.html`)};
    })`);
    return { count: dashboards.length, currentOrigin: dashboards[0].getURL().replace(/\/[^/]*$/, ""), blocked };
  }, oldOrigin);
  expect(crossRuntime).toEqual({ count: 1, currentOrigin: expect.not.stringContaining(oldOrigin), blocked: true });

  await page.evaluate(
    async ({ vaultId, dashboardId }) => {
      await window.vaultApi.openDashboard(vaultId, dashboardId);
      await window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 900, height: 600 });
    },
    { vaultId, dashboardId: dashboard.id },
  );
  const reopenedBytes = await app.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
    return contents?.executeJavaScript("globalThis.__boundaryProbeVersion");
  });
  expect(reopenedBytes).toBe("mutated");
  await page.evaluate(() => window.vaultApi.stopDashboard());
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
      }),
    vaultId,
  );
  await page.evaluate((id) => window.vaultApi.watch(id), vaultId);
  const open = () =>
    page.evaluate(
      async ({ vaultId, dashboardId }) => {
        await window.vaultApi.openDashboard(vaultId, dashboardId);
        await window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 });
      },
      { vaultId, dashboardId: dashboard.id },
    );

  const interruptedLoad = await page.evaluate(
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
  expect(interruptedLoad).toBe("resolved");
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);

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
  await open();

  await app.evaluate(({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith("vault-dashboard://"));
    if (!contents) throw new Error("Dashboard web contents not found.");
    contents.close({ waitForBeforeUnload: false });
  });
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
  await open();

  await app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("vault-dashboard://"))
      ?.emit("unresponsive");
  });
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length))
    .toBe(0);
  await page.evaluate(() => window.vaultApi.setDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 }));
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length)).toBe(
    0,
  );
  await app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("vault-dashboard://"))
      ?.emit("responsive");
  });
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length))
    .toBe(1);
  expect(await page.evaluate(() => window.vaultApi.dashboardRuntimeStatus())).toEqual(
    expect.objectContaining({ status: "ready", attached: true }),
  );

  await app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("vault-dashboard://"))
      ?.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  });
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);

  await open();
  await page.reload();
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("vault-dashboard://")),
      ),
    )
    .toBe(false);

  await page.waitForFunction(() => typeof window.vaultApi?.openDashboard === "function");
  await open();
  await page.evaluate(() => window.vaultApi.stopDashboard());
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
