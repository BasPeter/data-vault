import { app, BrowserWindow } from "electron";
import updater from "electron-updater";
import type { UpdateStatus } from "../src/types";

const { autoUpdater } = updater;

// Re-check GitHub Releases on this cadence so a freshly published version
// surfaces without the user reopening the application.
const AUTOMATIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let status: UpdateStatus = { state: "idle", currentVersion: app.getVersion() };

function publish(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("app:update-status", status);
}

export function configureUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => publish({ state: "checking", currentVersion: app.getVersion() }));
  autoUpdater.on("update-available", (info) => publish({ state: "available", currentVersion: app.getVersion(), version: info.version }));
  autoUpdater.on("update-not-available", () => publish({ state: "not-available", currentVersion: app.getVersion() }));
  autoUpdater.on("download-progress", (progress) => publish({
    state: "downloading", currentVersion: app.getVersion(), version: status.version,
    percent: Math.max(0, Math.min(100, progress.percent)),
  }));
  autoUpdater.on("update-downloaded", (info) => publish({ state: "downloaded", currentVersion: app.getVersion(), version: info.version }));
  autoUpdater.on("error", (error) => publish({ state: "error", currentVersion: app.getVersion(), message: error.message }));
  scheduleAutomaticChecks();
}

function scheduleAutomaticChecks(): void {
  // Update checks only function in an installed build; stay silent in development
  // so the renderer keeps its neutral "idle" state instead of surfacing an error.
  if (!app.isPackaged) return;
  void checkForUpdates();
  const timer = setInterval(() => void checkForUpdates(), AUTOMATIC_CHECK_INTERVAL_MS);
  timer.unref?.();
}

export function updateStatus(): UpdateStatus { return status; }

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    publish({ state: "error", currentVersion: app.getVersion(), message: "Update checks are available only in an installed build." });
    return status;
  }
  if (["checking", "available", "downloading"].includes(status.state)) return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (cause) {
    publish({ state: "error", currentVersion: app.getVersion(), message: cause instanceof Error ? cause.message : String(cause) });
  }
  return status;
}

export function installUpdate(): void {
  if (status.state !== "downloaded") throw new Error("No downloaded update is ready to install.");
  autoUpdater.quitAndInstall(false, true);
}
